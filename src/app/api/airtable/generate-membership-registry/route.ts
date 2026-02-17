import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { mapAirtableToMembershipRegistry, getMembershipRegistryTemplateName } from '@/lib/airtable-to-forms';
import { formatCompanyFileName } from '@/lib/document-names';
import { convertDocxToPdf } from '@/lib/docx-to-pdf';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

// Lambda and S3 configuration
const LAMBDA_MEMBERSHIP_REGISTRY_URL = process.env.LAMBDA_MEMBERSHIP_REGISTRY_URL || '';
// Template bucket (different from documents bucket)
const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET || 'company-formation-template-llc-and-inc';
const TEMPLATE_BASE_URL = `https://${TEMPLATE_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com`;
const S3_BUCKET = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';

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
 * Call Membership Registry Lambda function
 */
async function callMembershipRegistryLambda(formData: any, s3Bucket: string, s3Key: string, templateUrl: string): Promise<Buffer> {
  console.log('📞 Calling Membership Registry Lambda...');
  console.log('📋 Form data keys:', Object.keys(formData).join(', '));
  console.log('📄 Template URL:', templateUrl);
  
  if (!LAMBDA_MEMBERSHIP_REGISTRY_URL) {
    throw new Error('LAMBDA_MEMBERSHIP_REGISTRY_URL not configured');
  }
  
  const payload = {
    form_data: formData,
    s3_bucket: s3Bucket,
    s3_key: s3Key,
    templateUrl: templateUrl,
    return_docx: true,
  };
  
  const response = await fetch(LAMBDA_MEMBERSHIP_REGISTRY_URL, {
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
 * POST /api/airtable/generate-membership-registry
 * 
 * Generate Membership Registry DOCX from Airtable Formations record
 * 
 * Body:
 * - recordId: Airtable record ID (required)
 * - updateAirtable: Whether to update Airtable with Membership Registry URL (default: true)
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
    
    // Step 2: Verify it's an LLC
    const entityType = fields['Entity Type'] || 'LLC';
    if (entityType !== 'LLC') {
      return NextResponse.json(
        { error: 'Membership Registry is only for LLCs' },
        { status: 400 }
      );
    }
    
    // Step 3: Map Airtable fields to Membership Registry format
    const membershipRegistryData = mapAirtableToMembershipRegistry(record);
    
    console.log('📋 Membership Registry Data:', {
      companyName: membershipRegistryData.companyName,
      memberCount: membershipRegistryData.memberCount,
      managerCount: membershipRegistryData.managerCount,
    });
    
    // Step 4: Determine correct template based on member and manager counts
    const templatePath = getMembershipRegistryTemplateName(
      membershipRegistryData.memberCount,
      membershipRegistryData.managerCount
    );
    const templateUrl = `${TEMPLATE_BASE_URL}/${templatePath}`;
    
    console.log(`📄 Using template: ${templatePath}`);
    console.log(`📄 Template URL: ${templateUrl}`);
    
    // Step 5: Generate DOCX
    const vaultPath = fields['Vault Path'] || sanitizeCompanyName(fields['Company Name'] || 'Company');
    const docxBuffer = await callMembershipRegistryLambda(
      membershipRegistryData,
      S3_BUCKET,
      `${vaultPath}/formation/placeholder.docx`,
      templateUrl
    );

    // Store as DOCX (LibreOffice PDF conversion corrupts fonts in these templates)
    const bodyBuffer: Buffer = docxBuffer;
    const extension = 'docx' as const;
    const contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const fileName = formatCompanyFileName(fields['Company Name'] || 'Company', 'Membership Registry', extension);
    const s3Key = `${vaultPath}/formation/${fileName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: bodyBuffer,
      ContentType: contentType,
    }));

    console.log(`✅ Membership Registry ${extension.toUpperCase()} generated and uploaded: ${s3Key}`);

    // Step 6: Update Airtable (if requested)
    if (updateAirtable) {
      try {
        const docUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com/${s3Key}`;
        await new Promise((resolve, reject) => {
          base(AIRTABLE_TABLE_NAME).update(recordId, {
            'Membership Registry URL': docUrl,
          }, (err: any, record: any) => {
            if (err) {
              console.error('❌ Failed to update Airtable with Membership Registry URL:', err);
              reject(err);
            } else {
              console.log('✅ Updated Airtable with Membership Registry URL');
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
      s3Key: s3Key,
      viewUrl: `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com/${s3Key}`,
      docxSize: bodyBuffer.length,
      format: extension,
    });
  } catch (error: any) {
    console.error('❌ Failed to generate Membership Registry:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Membership Registry' },
      { status: 500 }
    );
  }
}

/**
 * Sanitize company name for filename
 */
function sanitizeCompanyName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}
