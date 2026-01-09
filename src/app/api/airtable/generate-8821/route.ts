import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { mapAirtableTo8821 } from '@/lib/airtable-to-forms';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

// Lambda and S3 configuration
const LAMBDA_8821_URL = process.env.LAMBDA_8821_URL || 'https://ql6ufztnwlohsqexpkm7wu44mu0xovla.lambda-url.us-west-1.on.aws/';
const TEMPLATE_8821_URL = process.env.TEMPLATE_8821_URL || 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f8821.pdf';
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
    base(AIRTABLE_TABLE_NAME).find(recordId, (err, record) => {
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
 * Call 8821 Lambda function
 */
async function call8821Lambda(formData: any, s3Bucket: string, s3Key: string): Promise<Buffer> {
  console.log('📞 Calling 8821 Lambda...');
  console.log('📋 Form data keys:', Object.keys(formData).join(', '));
  
  const payload = {
    form_data: formData,
    s3_bucket: s3Bucket,
    s3_key: s3Key,
    templateUrl: TEMPLATE_8821_URL,
    return_pdf: true,
  };
  
  const response = await fetch(LAMBDA_8821_URL, {
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
  
  const arrayBuffer = await response.arrayBuffer();
  console.log(`✅ Received PDF from Lambda: ${arrayBuffer.byteLength} bytes`);
  return Buffer.from(arrayBuffer);
}

/**
 * POST /api/airtable/generate-8821
 * 
 * Generate Form 8821 PDF from Airtable Formations record
 * 
 * Body:
 * - recordId: Airtable record ID (required)
 * - updateAirtable: Whether to update Airtable with 8821 URL (default: true)
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
    
    // Step 2: Map Airtable fields to 8821 format
    const form8821Data = mapAirtableTo8821(record);
    
    console.log('📋 8821 Form Data:', {
      companyName: form8821Data.companyName,
      signatureName: form8821Data.signatureName,
      signatureTitle: form8821Data.signatureTitle,
    });
    
    // Step 3: Generate PDF
    const vaultPath = fields['Vault Path'] || sanitizeCompanyName(fields['Company Name'] || 'Company');
    const fileName = `8821_${sanitizeCompanyName(fields['Company Name'] || 'Company')}.pdf`;
    const s3Key = `${vaultPath}/formation/${fileName}`;
    
    const pdfBuffer = await call8821Lambda(form8821Data, S3_BUCKET, s3Key);
    
    // Step 4: Upload to S3 (Lambda already uploaded, but we do it again as backup)
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }));
    
    console.log(`✅ Form 8821 PDF generated and uploaded: ${s3Key}`);
    
    // Step 5: Update Airtable with PDF URL (if requested)
    if (updateAirtable) {
      try {
        const pdfUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com/${s3Key}`;
        await new Promise((resolve, reject) => {
          base(AIRTABLE_TABLE_NAME).update(recordId, {
            'Form 8821 URL': pdfUrl,
          }, (err, record) => {
            if (err) {
              console.error('❌ Failed to update Airtable with 8821 URL:', err);
              reject(err);
            } else {
              console.log('✅ Updated Airtable with Form 8821 URL');
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
      pdfSize: pdfBuffer.length,
    });
  } catch (error: any) {
    console.error('❌ Failed to generate Form 8821:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Form 8821' },
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

