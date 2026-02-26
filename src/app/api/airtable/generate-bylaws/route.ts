import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { mapAirtableToBylaws } from '@/lib/airtable-to-forms';
import { formatCompanyFileName } from '@/lib/document-names';
import { convertDocxToPdf } from '@/lib/docx-to-pdf';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

// Lambda and S3 configuration
const LAMBDA_BYLAWS_URL = process.env.LAMBDA_BYLAWS_URL || '';
const S3_BUCKET = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';
const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET || S3_BUCKET;
const TEMPLATE_BASE_URL = `https://${TEMPLATE_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com`;
/**
 * Select the correct bylaws template based on owner count (1-6).
 * Templates: templates/bylaws/bylaws-{N}-owner(s).docx
 * Falls back to the old single template if scaled templates don't exist.
 */
function getBylawsTemplateUrl(ownerCount: number): string {
  const n = Math.max(1, Math.min(6, ownerCount));
  const suffix = n === 1 ? 'owner' : 'owners';
  const scaledPath = `templates/bylaws/bylaws-${n}-${suffix}.docx`;
  return `s3://${TEMPLATE_BUCKET}/${scaledPath}`;
}

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
 * Call Bylaws Lambda function
 */
async function callBylawsLambda(
  formData: any,
  s3Bucket: string,
  s3Key: string,
  templateUrl: string
): Promise<Buffer> {
  console.log('📞 Calling Bylaws Lambda...');
  console.log('📋 Form data keys:', Object.keys(formData).join(', '));
  console.log('📄 Template URL:', templateUrl);

  if (!LAMBDA_BYLAWS_URL) {
    throw new Error('LAMBDA_BYLAWS_URL not configured');
  }

  const payload = {
    form_data: formData,
    s3_bucket: s3Bucket,
    s3_key: s3Key,
    templateUrl: templateUrl,
    return_docx: true,
  };

  const response = await fetch(LAMBDA_BYLAWS_URL, {
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
 * POST /api/airtable/generate-bylaws
 *
 * Generate Bylaws DOCX from Airtable Formations record
 *
 * Body:
 * - recordId: Airtable record ID (required)
 * - updateAirtable: Whether to update Airtable with Bylaws URL (default: true)
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

    // Step 2: Verify it's a corporation
    const entityType = fields['Entity Type'] || 'LLC';
    if (entityType !== 'C-Corp' && entityType !== 'S-Corp') {
      return NextResponse.json(
        { error: 'Bylaws are only for corporations' },
        { status: 400 }
      );
    }

    // Step 3: Map Airtable fields to Bylaws format
    const bylawsData = mapAirtableToBylaws(record);

    console.log('📋 Bylaws Data:', {
      companyName: bylawsData.companyName,
      formationState: bylawsData.formationState,
      numberOfShares: bylawsData.numberOfShares,
      ownersCount: bylawsData.ownersCount,
    });

    // Pre-flight validation: ensure all owner names are present for the declared count
    for (let i = 1; i <= bylawsData.ownersCount; i++) {
      const ownerName = bylawsData[`owner${i}Name`];
      if (!ownerName || ownerName.trim() === '') {
        return NextResponse.json(
          { error: `Missing Owner ${i} Name — cannot generate Bylaws with empty shareholder` },
          { status: 400 }
        );
      }
    }

    // Step 4: Generate DOCX — select template based on owner count
    const bylawsTemplateUrl = getBylawsTemplateUrl(bylawsData.ownersCount || 1);
    console.log(`📄 Selected bylaws template for ${bylawsData.ownersCount} owner(s): ${bylawsTemplateUrl}`);

    const vaultPath = fields['Vault Path'] || sanitizeCompanyName(fields['Company Name'] || 'Company');

    // Generate correct filename (will use .docx for Lambda, then convert if needed)
    const fileName = formatCompanyFileName(fields['Company Name'] || 'Company', 'Bylaws', 'docx');
    const s3Key = `${vaultPath}/formation/${fileName}`;

    // Call Lambda with correct template for owner count
    const docxBuffer = await callBylawsLambda(
      bylawsData,
      S3_BUCKET,
      s3Key,
      bylawsTemplateUrl
    );

    // Store as DOCX (LibreOffice PDF conversion corrupts fonts in these templates)
    const bodyBuffer: Buffer = docxBuffer;
    const extension = 'docx' as const;
    const contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    let finalS3Key = s3Key;

    console.log(`✅ Bylaws ${extension.toUpperCase()} generated and uploaded: ${finalS3Key}`);

    // Step 5: Update Airtable (if requested)
    if (updateAirtable) {
      try {
        const docUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com/${finalS3Key}`;
        await new Promise((resolve, reject) => {
          base(AIRTABLE_TABLE_NAME).update(recordId, {
            'Bylaws URL': docUrl,
          }, (err: any, updatedRecord: any) => {
            if (err) {
              console.error('❌ Failed to update Airtable with Bylaws URL:', err);
              reject(err);
            } else {
              console.log('✅ Updated Airtable with Bylaws URL');
              resolve(updatedRecord);
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
    console.error('❌ Failed to generate Bylaws:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Bylaws' },
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
