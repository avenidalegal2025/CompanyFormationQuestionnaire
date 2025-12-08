import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || '';

// Lambda and S3 configuration
const LAMBDA_SS4_URL = process.env.LAMBDA_SS4_URL || 'https://rgkqsugoslrjh4kqq2kzwqfnry0ndryd.lambda-url.us-west-1.on.aws/';
const TEMPLATE_SS4_URL = process.env.TEMPLATE_SS4_URL || 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/fss4.pdf';
const S3_BUCKET = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';

// Initialize Airtable
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

/**
 * Summarize Business Purpose using OpenAI API to max 45 characters
 */
async function summarizeBusinessPurpose(businessPurpose: string): Promise<string> {
  if (!businessPurpose || businessPurpose.trim() === '') {
    return 'GENERAL BUSINESS OPERATIONS';
  }

  // If already short enough, just return uppercase
  if (businessPurpose.length <= 45) {
    return businessPurpose.toUpperCase();
  }

  // If no OpenAI API key, fallback to truncation
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured, using truncation fallback');
    return businessPurpose.substring(0, 45).toUpperCase();
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes business purposes concisely. Return only the summary, no explanations.',
          },
          {
            role: 'user',
            content: `Summarize this business purpose to a maximum of 45 characters: "${businessPurpose}"`,
          },
        ],
        max_tokens: 50,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ OpenAI API error: ${response.status} - ${errorText}`);
      // Fallback to truncation
      return businessPurpose.substring(0, 45).toUpperCase();
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || '';
    
    if (!summary) {
      return businessPurpose.substring(0, 45).toUpperCase();
    }

    // Ensure it's max 45 characters
    const finalSummary = summary.length > 45 
      ? summary.substring(0, 45).trim()
      : summary.trim();
    
    return finalSummary.toUpperCase();
  } catch (error: any) {
    console.error('❌ Error calling OpenAI API:', error);
    // Fallback to truncation
    return businessPurpose.substring(0, 45).toUpperCase();
  }
}

/**
 * Map Airtable Formations record to SS-4 form data format
 * 
 * Note: This function is now async because it calls OpenAI to summarize Business Purpose
 * 
 * SS-4 Form Fields:
 * - Line 1: Legal name of entity (company name)
 * - Line 2: Trade name (if different)
 * - Line 3: Executor/administrator/trustee name (for estates)
 * - Line 4a-4b: Mailing address
 * - Line 5a-5b: Street address (if different)
 * - Line 6: County and state
 * - Line 7a: Name of responsible party
 * - Line 7b: SSN/ITIN/EIN of responsible party
 * - Line 8a: Is this a LLC?
 * - Line 8b: Number of LLC members
 * - Line 9a: Type of entity
 * - Line 9b: If corporation, state of incorporation
 * - Line 10: Reason for applying
 * - Line 11: Date business started
 * - Line 12: Closing month of accounting year
 * - Line 13: Highest number of employees expected
 * - Line 14: First date wages or annuities were paid
 * - Line 15: Principal activity
 * - Line 16: Principal line of merchandise
 * - Line 17: Has the applicant ever applied for an EIN before?
 * - Line 18: Third Party Designee
 */
async function mapAirtableToSS4(record: any): Promise<any> {
  const fields = record.fields || record;
  
  // Find the first owner/partner with an SSN for responsible party (Line 7a and 7b)
  // If one of the partners has a SSN, use their full name for 7a and their SSN for 7b
  // If no one has a SSN, use Owner 1's name for 7a but leave 7b empty
  let responsiblePartyName = '';
  let responsiblePartyFirstName = '';
  let responsiblePartyLastName = '';
  let responsiblePartySSN = '';
  let responsiblePartyAddress = '';
  
  const ownerCount = fields['Owner Count'] || 1;
  for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
    const ownerSSN = fields[`Owner ${i} SSN`] || '';
    // Check if SSN is valid (not empty, not N/A, not FOREIGN)
    if (ownerSSN && ownerSSN.trim() !== '' && 
        ownerSSN.toUpperCase() !== 'N/A' && 
        !ownerSSN.toUpperCase().includes('FOREIGN')) {
      // Found an owner with valid SSN - use this one
      responsiblePartyName = fields[`Owner ${i} Name`] || '';
      responsiblePartyFirstName = fields[`Owner ${i} First Name`] || '';
      responsiblePartyLastName = fields[`Owner ${i} Last Name`] || '';
      responsiblePartySSN = ownerSSN;
      responsiblePartyAddress = fields[`Owner ${i} Address`] || '';
      break; // Use the first owner with valid SSN
    }
  }
  
  // If no owner has a valid SSN, use Owner 1's name but set SSN to "N/A-FOREIGN"
  if (!responsiblePartySSN) {
    responsiblePartyName = fields['Owner 1 Name'] || fields['Manager 1 Name'] || fields['Customer Name'] || '';
    responsiblePartyFirstName = fields['Owner 1 First Name'] || fields['Manager 1 First Name'] || '';
    responsiblePartyLastName = fields['Owner 1 Last Name'] || fields['Manager 1 Last Name'] || '';
    responsiblePartySSN = 'N/A-FOREIGN'; // Set to N/A-FOREIGN if no one has SSN
    responsiblePartyAddress = fields['Owner 1 Address'] || '';
  }
  
  // Parse company address
  const companyAddress = fields['Company Address'] || '';
  const addressParts = parseAddress(companyAddress);
  
  // Parse responsible party address
  const rpAddressParts = parseAddress(responsiblePartyAddress);
  
  // Determine entity type for SS-4
  const entityType = fields['Entity Type'] || 'LLC';
  const isLLC = entityType === 'LLC';
  const isCorp = entityType === 'C-Corp' || entityType === 'S-Corp';
  
  // Get owner count for LLC members
  const ownerCount = fields['Owner Count'] || 1;
  
  return {
    // Line 1: Legal name of entity
    companyName: fields['Company Name'] || '',
    companyNameBase: (fields['Company Name'] || '').replace(/\s+(LLC|Inc|Corp|Corporation|L\.L\.C\.|Incorporated)$/i, '').trim(),
    
    // Line 2: Trade name (usually same as company name)
    tradeName: '',
    
    // Entity information
    entityType: entityType,
    formationState: fields['Formation State'] || 'Florida',
    
    // Line 4a-4b: Mailing address (company address)
    companyAddress: companyAddress,
    mailingAddressLine1: addressParts.line1,
    mailingAddressLine2: addressParts.line2,
    mailingCity: addressParts.city,
    mailingState: addressParts.state,
    mailingZip: addressParts.zip,
    mailingCountry: addressParts.country || 'US',
    
    // Line 5a-5b: Street address (use same as mailing if not different)
    streetAddressLine1: addressParts.line1,
    streetAddressLine2: addressParts.line2,
    streetCity: addressParts.city,
    streetState: addressParts.state,
    streetZip: addressParts.zip,
    
    // Line 6: County and state where principal business is located
    countyState: `${addressParts.city || ''}, ${addressParts.state || 'FL'}`,
    
    // Line 7a: Name of responsible party
    responsiblePartyName: responsiblePartyName || `${responsiblePartyFirstName} ${responsiblePartyLastName}`.trim(),
    responsiblePartyFirstName: responsiblePartyFirstName || responsiblePartyName.split(' ')[0] || '',
    responsiblePartyLastName: responsiblePartyLastName || responsiblePartyName.split(' ').slice(1).join(' ') || '',
    
    // Line 7b: SSN/ITIN/EIN of responsible party
    responsiblePartySSN: responsiblePartySSN,
    
    // Responsible party address (for signature section)
    responsiblePartyAddress: responsiblePartyAddress,
    responsiblePartyCity: rpAddressParts.city,
    responsiblePartyState: rpAddressParts.state,
    responsiblePartyZip: rpAddressParts.zip,
    responsiblePartyCountry: rpAddressParts.country || 'US',
    
    // Line 8a: Is this a LLC?
    isLLC: isLLC ? 'Yes' : 'No',
    
    // Line 8b: Number of LLC members
    llcMemberCount: isLLC ? ownerCount : undefined,
    
    // Line 9a: Type of entity (checkbox)
    entityTypeCode: getEntityTypeCode(entityType),
    
    // Line 9b: State of incorporation (for corps) - ALL CAPS from Formation State column
    stateOfIncorporation: isCorp ? ((fields['Formation State'] || 'FL').toUpperCase()) : undefined,
    
    // Line 10: Summarized Business Purpose (max 45 characters, ALL CAPS)
    // This will be set after OpenAI summarization
    
    // Line 11: Date business started
    dateBusinessStarted: fields['Payment Date'] || new Date().toISOString().split('T')[0],
    
    // Line 12: Closing month of accounting year (usually December)
    closingMonth: 'December',
    
    // Line 13: Highest number of employees expected
    expectedEmployees: {
      agricultural: '0',
      household: '0',
      other: '0',
    },
    
    // Line 14: First date wages paid (N/A if no employees)
    firstWagesDate: 'N/A',
    
    // Line 15: Principal activity (full Business Purpose)
    businessPurpose: fields['Business Purpose'] || 'General business operations',
    principalActivity: fields['Business Purpose'] || 'General business operations',
    
    // Line 16: Principal line of merchandise (if applicable)
    principalMerchandise: '',
    
    // Line 17: Has applicant applied for EIN before?
    appliedBefore: 'No',
    
    // Line 18: Third Party Designee (Avenida Legal)
    designeeName: 'Avenida Legal',
    designeeAddress: '12550 Biscayne Blvd Ste 110, North Miami, FL 33181',
    designeePhone: '(305) 123-4567',
    designeeFax: '',
    
    // Signature information
    signatureName: responsiblePartyName || `${responsiblePartyFirstName} ${responsiblePartyLastName}`.trim(),
    signatureTitle: isLLC ? 'Member/Manager' : 'President',
    applicantPhone: fields['Forward Phone'] || fields['Business Phone'] || '',
    applicantFax: '',
    
    // Additional owner information for reference
    ownerCount: ownerCount,
    owners: getOwnersFromAirtable(fields),
    
    // Metadata
    customerEmail: fields['Customer Email'] || '',
    customerName: fields['Customer Name'] || '',
    vaultPath: fields['Vault Path'] || '',
  };
}

/**
 * Parse address string into components
 */
function parseAddress(addressStr: string): {
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
} {
  if (!addressStr) {
    return { line1: '', line2: '', city: '', state: '', zip: '', country: 'US' };
  }
  
  const parts = addressStr.split(',').map(p => p.trim());
  
  if (parts.length >= 3) {
    // Format: "123 Main St, City, State ZIP" or "123 Main St, Suite 100, City, State ZIP"
    const lastPart = parts[parts.length - 1];
    const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)?/);
    
    if (stateZipMatch) {
      const state = stateZipMatch[1];
      const zip = stateZipMatch[2] || '';
      const city = parts[parts.length - 2] || '';
      const line1 = parts[0] || '';
      const line2 = parts.length > 3 ? parts.slice(1, -2).join(', ') : '';
      
      return { line1, line2, city, state, zip, country: 'US' };
    }
  }
  
  // Fallback: just put everything in line1
  return { line1: addressStr, line2: '', city: '', state: '', zip: '', country: 'US' };
}

/**
 * Get entity type code for SS-4 form
 */
function getEntityTypeCode(entityType: string): string {
  switch (entityType?.toUpperCase()) {
    case 'LLC':
      return 'LLC';
    case 'C-CORP':
    case 'CORPORATION':
      return 'Corporation';
    case 'S-CORP':
      return 'S Corporation';
    case 'PARTNERSHIP':
      return 'Partnership';
    case 'SOLE PROPRIETORSHIP':
      return 'Sole proprietor';
    default:
      return 'Other';
  }
}

/**
 * Extract owners from Airtable fields
 */
function getOwnersFromAirtable(fields: any): any[] {
  const owners = [];
  const ownerCount = fields['Owner Count'] || 0;
  
  for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
    const owner = {
      name: fields[`Owner ${i} Name`] || '',
      firstName: fields[`Owner ${i} First Name`] || '',
      lastName: fields[`Owner ${i} Last Name`] || '',
      ssn: fields[`Owner ${i} SSN`] || '',
      address: fields[`Owner ${i} Address`] || '',
      ownership: fields[`Owner ${i} Ownership %`] || 0,
    };
    
    if (owner.name || owner.firstName || owner.lastName) {
      owners.push(owner);
    }
  }
  
  return owners;
}

/**
 * Fetch Airtable record by ID
 */
async function fetchAirtableRecord(recordId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    base(AIRTABLE_TABLE_NAME).find(recordId, (err, record) => {
      if (err) {
        reject(err);
      } else {
        resolve(record);
      }
    });
  });
}

/**
 * Update Airtable record with SS-4 URL
 */
async function updateAirtableWithSS4Url(recordId: string, s3Key: string): Promise<void> {
  const ss4Url = `${BASE_URL}/api/documents/view?key=${encodeURIComponent(s3Key)}`;
  
  return new Promise((resolve, reject) => {
    base(AIRTABLE_TABLE_NAME).update(recordId, {
      'SS-4 URL': ss4Url,
    }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Call Lambda function to generate SS-4 PDF
 */
async function callSS4Lambda(formData: any, s3Bucket: string, s3Key: string): Promise<Buffer> {
  console.log('📞 Calling SS-4 Lambda...');
  console.log('📋 Form data keys:', Object.keys(formData).join(', '));
  
  const payload = {
    form_data: formData,
    s3_bucket: s3Bucket,
    s3_key: s3Key,
    templateUrl: TEMPLATE_SS4_URL,
    return_pdf: true,
  };
  
  const response = await fetch(LAMBDA_SS4_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  console.log(`📡 Lambda response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lambda failed: ${response.status} - ${errorText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * POST /api/airtable/generate-ss4
 * 
 * Generate SS-4 PDF from Airtable Formations record
 * 
 * Body:
 * - recordId: Airtable record ID (required)
 * - updateAirtable: Whether to update Airtable with SS-4 URL (default: true)
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
    
    // Step 2: Map Airtable fields to SS-4 format (async - includes OpenAI summarization)
    const ss4Data = await mapAirtableToSS4(record);
    
    // Step 2a: Summarize Business Purpose for Line 10
    const businessPurpose = fields['Business Purpose'] || 'General business operations';
    const summarizedBusinessPurpose = await summarizeBusinessPurpose(businessPurpose);
    ss4Data.summarizedBusinessPurpose = summarizedBusinessPurpose; // For Line 10
    
    console.log('📋 Mapped SS-4 data:', {
      companyName: ss4Data.companyName,
      responsibleParty: ss4Data.responsiblePartyName,
      entityType: ss4Data.entityType,
      summarizedBusinessPurpose: summarizedBusinessPurpose,
    });
    
    // Step 3: Determine S3 path
    const vaultPath = fields['Vault Path'] || sanitizeCompanyName(fields['Company Name'] || 'unknown');
    const fileName = `SS-4_${sanitizeCompanyName(fields['Company Name'] || 'company')}.pdf`;
    const s3Key = `${vaultPath}/formation/${fileName}`;
    
    console.log(`📁 S3 destination: s3://${S3_BUCKET}/${s3Key}`);
    
    // Step 4: Call Lambda to generate PDF
    const pdfBuffer = await callSS4Lambda(ss4Data, S3_BUCKET, s3Key);
    console.log(`✅ SS-4 PDF generated: ${pdfBuffer.length} bytes`);
    
    // Step 5: Update Airtable with SS-4 URL
    if (updateAirtable) {
      await updateAirtableWithSS4Url(recordId, s3Key);
      console.log(`✅ Airtable updated with SS-4 URL`);
    }
    
    return NextResponse.json({
      success: true,
      message: 'SS-4 PDF generated successfully',
      companyName: fields['Company Name'],
      s3Key: s3Key,
      s3Url: `s3://${S3_BUCKET}/${s3Key}`,
      viewUrl: `${BASE_URL}/api/documents/view?key=${encodeURIComponent(s3Key)}`,
      pdfSize: pdfBuffer.length,
    });
    
  } catch (error: any) {
    console.error('❌ Error generating SS-4:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate SS-4' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/airtable/generate-ss4
 * 
 * Get information about SS-4 generation
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get('recordId');
  
  if (!recordId) {
    return NextResponse.json({
      endpoint: '/api/airtable/generate-ss4',
      description: 'Generate SS-4 PDF from Airtable Formations record',
      method: 'POST',
      body: {
        recordId: 'Airtable record ID (required)',
        updateAirtable: 'Whether to update Airtable with SS-4 URL (default: true)',
      },
      example: {
        recordId: 'recXXXXXXXXXXXXXX',
        updateAirtable: true,
      },
    });
  }
  
  // If recordId provided, fetch and show the data that would be used
  try {
    const record = await fetchAirtableRecord(recordId);
    const ss4Data = await mapAirtableToSS4(record);
    
    // Summarize Business Purpose for preview
    const businessPurpose = record.fields['Business Purpose'] || 'General business operations';
    const summarizedBusinessPurpose = await summarizeBusinessPurpose(businessPurpose);
    ss4Data.summarizedBusinessPurpose = summarizedBusinessPurpose;
    
    return NextResponse.json({
      recordId: recordId,
      companyName: record.fields['Company Name'],
      ss4DataPreview: {
        companyName: ss4Data.companyName,
        entityType: ss4Data.entityType,
        formationState: ss4Data.formationState,
        responsiblePartyName: ss4Data.responsiblePartyName,
        mailingAddress: `${ss4Data.mailingAddressLine1}, ${ss4Data.mailingCity}, ${ss4Data.mailingState} ${ss4Data.mailingZip}`,
        ownerCount: ss4Data.ownerCount,
      },
      message: 'Use POST to generate the SS-4 PDF',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch record' },
      { status: 500 }
    );
  }
}

/**
 * Sanitize company name for use in file paths
 */
function sanitizeCompanyName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
    .toLowerCase();
}





