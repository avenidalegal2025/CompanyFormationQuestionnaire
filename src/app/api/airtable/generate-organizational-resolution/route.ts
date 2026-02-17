import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { mapAirtableToMembershipRegistry, getOrganizationalResolutionTemplateName, mapAirtableToCorpOrganizationalResolution, getCorpOrganizationalResolution216TemplateName, formatLegalDate } from '@/lib/airtable-to-forms';
import { formatCompanyFileName, formatCompanyDocumentTitle } from '@/lib/document-names';
import { convertDocxToPdf } from '@/lib/docx-to-pdf';
import { getUserCompanyDocuments, saveUserCompanyDocuments } from '@/lib/dynamo';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

// Lambda and S3 configuration
const LAMBDA_ORGANIZATIONAL_RESOLUTION_URL = process.env.LAMBDA_ORGANIZATIONAL_RESOLUTION_URL || '';
const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET || 'company-formation-template-llc-and-inc';
const TEMPLATE_BASE_URL = `https://${TEMPLATE_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com`;
const S3_BUCKET = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';
const CORPORATE_TEMPLATE_BASE_PATH =
  process.env.ORGANIZATIONAL_RESOLUTION_INC_TEMPLATE_BASE_PATH || 'templates/organizational-resolution-inc';
/** C-Corp 216 templates (6×6×6 shareholders/directors/officers) from Org_Resolution_Templates_216_2 */
const CORPORATE_216_TEMPLATE_BASE_PATH =
  process.env.ORGANIZATIONAL_RESOLUTION_INC_216_TEMPLATE_BASE_PATH || 'templates/organizational-resolution-inc-216';

// Initialize Airtable
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Fetch Airtable record by ID
 */
async function fetchAirtableRecord(recordId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    base(AIRTABLE_TABLE_NAME).find(recordId, (err: any, record: any) => {
      if (err) {
        console.error(`❌ Error fetching Airtable record ${recordId}:`, err);
        reject(err);
      } else {
        resolve(record);
      }
    });
  });
}

/**
 * Call Organizational Resolution Lambda function
 */
async function callOrganizationalResolutionLambda(formData: any, s3Bucket: string, s3Key: string, templateUrl: string): Promise<Buffer> {
  console.log('📞 Calling Organizational Resolution Lambda...');
  console.log('📋 Form data keys:', Object.keys(formData).join(', '));
  console.log('📄 Template URL:', templateUrl);
  
  if (!LAMBDA_ORGANIZATIONAL_RESOLUTION_URL) {
    throw new Error('LAMBDA_ORGANIZATIONAL_RESOLUTION_URL not configured');
  }
  
  const payload = {
    form_data: formData,
    s3_bucket: s3Bucket,
    s3_key: s3Key,
    templateUrl: templateUrl,
    return_docx: true,
  };
  
  const response = await fetch(LAMBDA_ORGANIZATIONAL_RESOLUTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  console.log(`📡 Lambda response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Lambda error response: ${errorText}`);
    throw new Error(`Lambda failed: ${response.status} - ${errorText}`);
  }
  
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    const base64 = json?.docx_base64;
    if (!base64) {
      throw new Error('Lambda response missing docx_base64');
    }
    const buffer = Buffer.from(base64, 'base64');
    console.log(`✅ Decoded DOCX from Lambda JSON: ${buffer.length} bytes`);
    return buffer;
  }

  const arrayBuffer = await response.arrayBuffer();
  console.log(`✅ Received DOCX from Lambda: ${arrayBuffer.byteLength} bytes`);
  return Buffer.from(arrayBuffer);
}

/**
 * POST /api/airtable/generate-organizational-resolution
 * 
 * Generate Organizational Resolution DOCX from Airtable Formations record
 * 
 * Body:
 * - recordId: Airtable record ID (required)
 * - updateAirtable: Whether to update Airtable with Organizational Resolution URL (default: true)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recordId, updateAirtable = true } = body;
    
    if (!recordId) {
      return NextResponse.json(
        { error: 'Missing recordId' },
        { status: 400 }
      );
    }
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Airtable not configured' },
        { status: 500 }
      );
    }
    
    console.log(`📋 Fetching Airtable record: ${recordId}`);
    
    // Step 1: Fetch record from Airtable
    const record = await fetchAirtableRecord(recordId);
    const fields = record.fields;
    
    console.log(`✅ Found record: ${fields['Company Name']}`);
    
    // Step 2: Verify it's a supported entity type
    const entityType = fields['Entity Type'] || 'LLC';
    if (entityType !== 'LLC' && entityType !== 'C-Corp' && entityType !== 'S-Corp') {
      return NextResponse.json(
        { error: 'Organizational Resolution is only for LLCs or Corporations' },
        { status: 400 }
      );
    }
    
    // Step 3: Map Airtable fields to Organizational Resolution format
    const orgResolutionData = entityType === 'LLC'
      ? mapAirtableToMembershipRegistry(record)
      : mapAirtableToCorpOrganizationalResolution(record);
    if (entityType === 'LLC') {
      orgResolutionData.formationDate = formatLegalDate(fields['Payment Date']);
    }
    
    console.log('📋 Organizational Resolution Data:', {
      companyName: orgResolutionData.companyName,
      memberCount: orgResolutionData.memberCount,
      managerCount: orgResolutionData.managerCount,
    });
    
    // Step 4: Determine correct template (LLC = resolution; C-Corp/S-Corp = 216 templates by shareholders×directors×officers, or fallback to 1–6 minutes)
    const templatePath = entityType === 'LLC'
      ? getOrganizationalResolutionTemplateName(
          orgResolutionData.memberCount,
          orgResolutionData.managerCount
        )
      : (() => {
          const shareholders = orgResolutionData.memberCount || 1;
          const directors = (orgResolutionData as { directorCount?: number }).directorCount ?? 1;
          const officers = orgResolutionData.managerCount || 1;
          const fileName = getCorpOrganizationalResolution216TemplateName(shareholders, directors, officers);
          return `${CORPORATE_216_TEMPLATE_BASE_PATH}/${fileName}`;
        })();
    const templateUrl = `${TEMPLATE_BASE_URL}/${templatePath}`;
    
    console.log(`📄 Using template: ${templatePath}`);
    console.log(`📄 Template URL: ${templateUrl}`);
    
    // Step 5: Generate DOCX
    const vaultPath = fields['Vault Path'] || sanitizeFilename(fields['Company Name'] || 'Company');
    
    // Determine file format first (before calling Lambda)
    let extension: 'pdf' | 'docx' = 'docx';
    let contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    // Check if PDF conversion is available (we'll try after Lambda returns DOCX)
    const willTryPdf = !!process.env.LAMBDA_DOCX_TO_PDF_FUNCTION_NAME;
    
    // Generate correct filename (will use .docx for Lambda, then convert if needed)
    const fileName = formatCompanyFileName(fields['Company Name'] || 'Company', 'Organizational Resolution', 'docx');
    const s3Key = `${vaultPath}/formation/${fileName}`;
    
    // Call Lambda with correct filename (not placeholder)
    const docxBuffer = await callOrganizationalResolutionLambda(
      orgResolutionData,
      S3_BUCKET,
      s3Key, // Use correct filename, not placeholder
      templateUrl
    );

    // Step 5b: Convert to PDF when conversion Lambda is configured
    let bodyBuffer: Buffer = docxBuffer;
    let finalS3Key = s3Key;
    try {
      const pdfBuffer = await convertDocxToPdf(docxBuffer);
      if (pdfBuffer) {
        bodyBuffer = pdfBuffer;
        extension = 'pdf';
        contentType = 'application/pdf';
        // Update filename to PDF version
        const pdfFileName = formatCompanyFileName(fields['Company Name'] || 'Company', 'Organizational Resolution', 'pdf');
        finalS3Key = `${vaultPath}/formation/${pdfFileName}`;
        
        // Upload PDF version (Lambda already uploaded DOCX, now upload PDF)
        await s3Client.send(new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: finalS3Key,
          Body: bodyBuffer,
          ContentType: contentType,
        }));
        console.log('✅ Converted Organizational Resolution to PDF and uploaded');
      }
    } catch (convErr: any) {
      console.warn('⚠️ DOCX→PDF conversion failed, using DOCX from Lambda:', convErr?.message);
      // Lambda already uploaded DOCX, so finalS3Key is already correct
    }

    console.log(`✅ Organizational Resolution ${extension.toUpperCase()} generated and uploaded: ${finalS3Key}`);

    // Step 6: Update DynamoDB document record with final s3Key
    const customerEmail = ((fields['Customer Email'] as string) || '').toLowerCase().trim();
    if (customerEmail) {
      try {
        const existingDocs = await getUserCompanyDocuments(customerEmail, recordId);
        const updatedDocs = existingDocs.map(doc => {
          if (doc.id !== 'organizational-resolution') return doc;
          return {
            ...doc,
            name: formatCompanyDocumentTitle(fields['Company Name'] || 'Company', 'Organizational Resolution'),
            s3Key: finalS3Key,
            status: 'generated' as const,
          };
        });
        await saveUserCompanyDocuments(customerEmail, recordId, updatedDocs);
        console.log('✅ Updated DynamoDB Organizational Resolution document key');
      } catch (dbError) {
        console.error('⚠️ Failed to update DynamoDB org resolution key:', dbError);
      }
    }

    // Step 7: Update Airtable (if requested)
    if (updateAirtable) {
      try {
        const docUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com/${finalS3Key}`;
        await new Promise((resolve, reject) => {
          base(AIRTABLE_TABLE_NAME).update(recordId, {
            'Organizational Resolution URL': docUrl,
          }, (err: any, record: any) => {
            if (err) {
              console.error('❌ Failed to update Airtable with Organizational Resolution URL:', err);
              reject(err);
            } else {
              console.log('✅ Updated Airtable with Organizational Resolution URL');
              resolve(record);
            }
          });
        });
      } catch (updateError) {
        console.error('⚠️ Failed to update Airtable (continuing anyway):', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      recordId: recordId,
      s3Key: finalS3Key,
      viewUrl: `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com/${finalS3Key}`,
      docxSize: bodyBuffer.length,
      format: extension,
    });
  } catch (error: any) {
    console.error('❌ Failed to generate Organizational Resolution:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Organizational Resolution' },
      { status: 500 }
    );
  }
}

/**
 * Sanitize company name for filename
 */
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80);
  return cleaned || 'Company';
}
