/**
 * PDF Filler Library
 * 
 * Handles calling Lambda functions to fill out PDF forms (SS-4, 2848, 8821)
 * and saving the filled PDFs to S3.
 */

import { uploadDocument } from './s3-vault';

// Lambda function URLs
const LAMBDA_SS4_URL = process.env.LAMBDA_SS4_URL || 'https://sk5p2uuxrdubzaf2uh7vvqc2bu0kcaoz.lambda-url.us-west-1.on.aws/';
const LAMBDA_2848_URL = process.env.LAMBDA_2848_URL || 'https://z246mmg5ojst6boxjy53ilekii0yualo.lambda-url.us-west-1.on.aws/';
const LAMBDA_8821_URL = process.env.LAMBDA_8821_URL || 'https://ql6ufztnwlohsqexpkm7wu44mu0xovla.lambda-url.us-west-1.on.aws/';

// Template PDF URLs in S3
const TEMPLATE_SS4_URL = process.env.TEMPLATE_SS4_URL || 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/fss4.pdf';
const TEMPLATE_2848_URL = process.env.TEMPLATE_2848_URL || 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f2848.pdf';
const TEMPLATE_8821_URL = process.env.TEMPLATE_8821_URL || 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f8821.pdf';

// S3 bucket for storing generated PDFs
const S3_BUCKET = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';

export interface PDFGenerationResult {
  success: boolean;
  s3Key?: string;
  fileName?: string;
  error?: string;
  size?: number;
}

export interface QuestionnaireData {
  company?: {
    companyName?: string;
    entityType?: string;
    formationState?: string;
    address?: string;
    addressLine1?: string;
    addressLine2?: string;
    fullAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    zipCode?: string;
    hasUsaAddress?: string | boolean;
    businessPurpose?: string;
    businessPhone?: string; // Business Phone from Airtable
    usPhoneNumber?: string;
    phone?: string;
    phoneNumber?: string;
  };
  owners?: Array<{
    fullName?: string;
    tin?: string;
    ssn?: string;
    address?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    dateOfBirth?: string;
    passportS3Key?: string;
  }>;
  profile?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  admin?: {
    managersCount?: number;
    manager1Name?: string;
    manager1Address?: string;
    manager2Name?: string;
    manager2Address?: string;
    // ... more managers
  };
  agreement?: {
    corp_taxOwner?: string;
    llc_taxOwner?: string;
  };
}

/**
 * Transforms questionnaire data to SS-4 (EIN Application) format
 */
function transformDataForSS4(formData: QuestionnaireData): any {
  const company = formData.company || {};
  const owners = formData.owners || [];
  
  // Find the first owner/partner with an SSN for responsible party (Line 7a and 7b)
  // If one of the partners has a SSN, use their full name for 7a and their SSN for 7b
  // If no one has a SSN, use Owner 1's name for 7a but leave 7b empty
  let responsibleOwner = owners[0] || {};
  let hasValidSSN = false;
  
  for (const owner of owners) {
    const ssn = owner.ssn || owner.tin || '';
    if (ssn && ssn.trim() !== '' && ssn.toUpperCase() !== 'N/A' && !ssn.toUpperCase().includes('FOREIGN')) {
      responsibleOwner = owner;
      hasValidSSN = true;
      break; // Use the first owner with valid SSN
    }
  }
  
  // Get company name without entity suffix for some fields
  const companyNameBase = (company.companyName || '').replace(/\s+(LLC|Inc|Corp|Corporation|L\.L\.C\.|Incorporated)$/i, '').trim();
  
  return {
    // Company Information
    companyName: company.companyName || '',
    companyNameBase: companyNameBase,
    entityType: company.entityType || 'LLC',
    formationState: company.formationState || '',
    businessPurpose: company.businessPurpose || '',
    
    // Company Address
    companyAddress: company.address || company.addressLine1 || company.fullAddress || '',
    
    // Responsible Party (first owner with SSN, or primary owner if none have SSN)
    responsiblePartyName: responsibleOwner.fullName || '',
    responsiblePartySSN: hasValidSSN ? (responsibleOwner.ssn || responsibleOwner.tin || '') : 'N/A-FOREIGN', // N/A-FOREIGN if no owner has SSN
    responsiblePartyAddress: responsibleOwner.address || responsibleOwner.addressLine1 || '',
    responsiblePartyCity: responsibleOwner.city || '',
    responsiblePartyState: responsibleOwner.state || '',
    responsiblePartyZip: responsibleOwner.zipCode || '',
    responsiblePartyCountry: responsibleOwner.country || 'USA',
    
    // Additional owner information if needed
    ownerCount: owners.length,
    owners: owners.map((owner, idx) => ({
      name: owner.fullName || `Owner ${idx + 1}`,
      ssn: owner.ssn || owner.tin || '',
      address: owner.address || owner.addressLine1 || '',
      city: owner.city || '',
      state: owner.state || '',
      zip: owner.zipCode || '',
      country: owner.country || 'USA',
    })),
  };
}

/**
 * Transforms questionnaire data to Form 2848 (Power of Attorney) format
 */
function transformDataFor2848(formData: QuestionnaireData): any {
  const company = formData.company || {};
  const owners = formData.owners || [];
  const profile = formData.profile || {};
  
  // Get tax owner (person authorized to handle tax matters)
  const taxOwnerName = formData.agreement?.corp_taxOwner || 
                       formData.agreement?.llc_taxOwner || 
                       owners[0]?.fullName || '';
  
  const taxOwner = owners.find(o => o.fullName === taxOwnerName) || owners[0] || {};
  
  return {
    // Company Information
    companyName: company.companyName || '',
    ein: '', // Will be filled after EIN is obtained
    companyAddress: company.address || company.addressLine1 || company.fullAddress || '',
    
    // Tax Owner (Principal)
    principalName: taxOwnerName,
    principalSSN: taxOwner.ssn || taxOwner.tin || '',
    principalAddress: taxOwner.address || taxOwner.addressLine1 || '',
    principalCity: taxOwner.city || '',
    principalState: taxOwner.state || '',
    principalZip: taxOwner.zipCode || '',
    
    // Representative (Avenida Legal)
    representativeName: 'Avenida Legal',
    representativeAddress: '12550 Biscayne Blvd Ste 110',
    representativeCity: 'North Miami',
    representativeState: 'FL',
    representativeZip: '33181',
    representativePhone: '(305) 123-4567', // Update with actual phone
    representativeFax: '', // If available
    
    // Authorization details
    taxMatters: true,
    years: '2024, 2025, 2026', // Current and future years
  };
}

/**
 * Transforms questionnaire data to Form 8821 (Tax Information Authorization) format
 */
function transformDataFor8821(formData: QuestionnaireData): any {
  const company = formData.company || {};
  const owners = formData.owners || [];
  const agreement = formData.agreement || {};
  
  // Determine entity type
  const entityType = company.entityType || '';
  const isLLC = entityType.toUpperCase().includes('LLC') || entityType.toUpperCase().includes('L.L.C.');
  const isCorp = entityType.toUpperCase().includes('CORP') || entityType.toUpperCase().includes('INC');
  const ownerCount = owners.length;
  
  // Get responsible party (same logic as SS-4) - must have SSN
  // This is the person who will sign the form
  let responsibleParty: any = null;
  let responsiblePartyName = '';
  let responsiblePartyFirstName = '';
  let responsiblePartyLastName = '';
  let responsiblePartySSN = '';
  let responsiblePartyOfficerRole = ''; // For corporations
  
  // First, try to get from agreement (if specified) - this matches SS-4 logic
  const agreementTaxOwnerName = agreement.corp_taxOwner || agreement.llc_taxOwner || '';
  if (agreementTaxOwnerName) {
    responsibleParty = owners.find(o => o.fullName === agreementTaxOwnerName) || null;
    if (responsibleParty) {
      responsiblePartyName = responsibleParty.fullName || '';
      // Try to parse first/last name if available
      const nameParts = responsiblePartyName.split(' ');
      responsiblePartyFirstName = nameParts[0] || '';
      responsiblePartyLastName = nameParts.slice(1).join(' ') || '';
      responsiblePartySSN = responsibleParty.ssn || responsibleParty.tin || '';
    }
  }
  
  // If not found or no SSN, find first owner with SSN (same as SS-4)
  if (!responsibleParty || !responsiblePartySSN || responsiblePartySSN.toUpperCase().includes('FOREIGN')) {
    // Find first owner with valid SSN
    responsibleParty = owners.find(o => {
      const ssn = o.ssn || o.tin || '';
      return ssn && ssn.trim() !== '' && 
             ssn.toUpperCase() !== 'N/A' && 
             !ssn.toUpperCase().includes('FOREIGN');
    }) || owners[0] || null;
    
    if (responsibleParty) {
      responsiblePartyName = responsibleParty.fullName || '';
      const nameParts = responsiblePartyName.split(' ');
      responsiblePartyFirstName = nameParts[0] || '';
      responsiblePartyLastName = nameParts.slice(1).join(' ') || '';
      responsiblePartySSN = responsibleParty.ssn || responsibleParty.tin || '';
    }
  }
  
  // For corporations, try to get officer role from admin section
  if (isCorp && responsibleParty) {
    const admin = formData.admin || {};
    // Check if responsible party is an officer (manager1Name, etc.)
    // For questionnaire, default to PRESIDENT
    responsiblePartyOfficerRole = 'PRESIDENT';
  }
  
  // Build base name (same as SS-4)
  const baseName = responsiblePartyName || `${responsiblePartyFirstName} ${responsiblePartyLastName}`.trim();
  
  // Determine signature name and title (same format as SS-4)
  let signatureName = baseName;
  let signatureTitle = '';
  
  // Check if sole proprietor (1 owner with 100% ownership)
  // Note: Ownership percentage might be stored differently in questionnaire data
  const isSoleProprietor = ownerCount === 1;
  
  if (isCorp && (entityType.toUpperCase().includes('C-CORP') || entityType.toUpperCase().includes('S-CORP'))) {
    // For C-Corp and S-Corp: Add officer role to signature name
    // Format: "NAME, ROLE" (with space after comma) - same as SS-4
    if (responsiblePartyOfficerRole && responsiblePartyOfficerRole.trim() !== '') {
      const roleUpper = responsiblePartyOfficerRole.trim().toUpperCase();
      const isPresident = roleUpper === 'PRESIDENT' || 
                         (roleUpper.startsWith('PRESIDENT') && !roleUpper.includes('VICE') && !roleUpper.includes('CO-'));
      const finalRole = isPresident ? 'PRESIDENT' : roleUpper;
      signatureName = `${baseName}, ${finalRole}`;
    } else {
      signatureName = `${baseName}, PRESIDENT`;
    }
    signatureTitle = 'PRESIDENT';
  } else if (isSoleProprietor && isLLC) {
    // Sole proprietor (1 owner with 100% ownership) - use ",SOLE MEMBER" for LLCs only
    signatureName = `${baseName},SOLE MEMBER`;
    signatureTitle = 'SOLE MEMBER';
  } else if (isLLC) {
    // Multi-member LLC
    signatureName = `${baseName},MEMBER`;
    signatureTitle = 'MEMBER';
  } else {
    // Default fallback
    signatureName = baseName || 'AUTHORIZED SIGNER';
    signatureTitle = 'AUTHORIZED SIGNER';
  }
  
  // Ensure we always have a signature name and title
  if (!signatureName || signatureName.trim() === '') {
    signatureName = 'AUTHORIZED SIGNER';
  }
  if (!signatureTitle || signatureTitle.trim() === '') {
    signatureTitle = 'AUTHORIZED SIGNER';
  }
  
  // Log for debugging (same format as SS-4)
  console.log(`📝 8821 Signature (same as SS-4): name="${signatureName}", title="${signatureTitle}", baseName="${baseName}", hasSSN=${!!responsiblePartySSN}`);
  
  // Parse company address - Use Airtable Company Address format: "Street, City, State ZIP"
  // Priority: Use full address string from Airtable format, then fallback to components
  // The address should come from Airtable's "Company Address" column
  let companyAddress = company.address || company.addressLine1 || company.fullAddress || '';
  let companyAddressLine2 = company.addressLine2 || '';
  let companyCity = company.city || '';
  let companyState = company.state || '';
  let companyZip = company.postalCode || company.zipCode || '';
  
  // Parse full address string (Airtable format: "12550 Biscayne Blvd Ste 110, North Miami, FL 33181")
  // This should be split into:
  // Line 2: "12550 Biscayne Blvd Ste 110" (street address)
  // Line 3: "North Miami, FL 33181" (city, state, zip)
  // Always try to parse if we have a full address string, even if city/state are already set
  if (companyAddress) {
    // Try to parse "Street, City, State ZIP" format (Airtable format)
    const addressParts = companyAddress.split(',').map(p => p.trim());
    if (addressParts.length >= 3) {
      // Format: "Street, City, State ZIP"
      companyAddress = addressParts[0]; // Street address (Line 2)
      companyCity = addressParts[1] || companyCity || ''; // City (prefer parsed, fallback to existing)
      const stateZipStr = addressParts[2] || ''; // "State ZIP"
      // Extract state and zip from "State ZIP"
      const stateZipMatch = stateZipStr.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (stateZipMatch) {
        companyState = stateZipMatch[1] || companyState || '';
        companyZip = stateZipMatch[2] || companyZip || '';
      } else {
        // Fallback: try to split by space
        const parts = stateZipStr.split(/\s+/);
        if (parts.length >= 2) {
          companyState = parts[0] || companyState || '';
          companyZip = parts[1] || companyZip || '';
        }
      }
    } else if (addressParts.length === 2) {
      // Format: "Street, City State ZIP"
      companyAddress = addressParts[0]; // Street address
      const cityStateZip = addressParts[1];
      const parts = cityStateZip.split(/\s+/);
      if (parts.length >= 2) {
        companyState = parts[parts.length - 2] || companyState || '';
        companyZip = parts[parts.length - 1] || companyZip || '';
        companyCity = parts.slice(0, -2).join(' ') || companyCity || cityStateZip;
      }
    }
  }
  
  // For 8821, we want:
  // Line 2: Street address (companyAddress)
  // Line 3: City, State ZIP (companyCity, companyState, companyZip)
  // So we don't use companyAddressLine2 for the street - it goes on line 2
  // And city/state/zip goes on line 3
  
  // Get company phone number - Use Business Phone from Airtable if available
  // Priority: Business Phone from Airtable > usPhoneNumber from questionnaire > other phone fields
  // Note: When generating from questionnaire, Business Phone should be in usPhoneNumber
  // When regenerating from Airtable, we should pass Business Phone explicitly
  const companyPhone = company.businessPhone || company.usPhoneNumber || company.phone || company.phoneNumber || '';
  
  // Ensure company name is available - this is critical for Box 1
  const companyFullName = company.companyName || '';
  
  const transformedData = {
    // Company Information
    companyName: companyFullName,
    ein: '', // Will be filled after EIN is obtained
    companyAddress: company.address || company.addressLine1 || company.fullAddress || '',
    
    // Box 1: Taxpayer (COMPANY) - Use company's full name and address from Airtable
    // IMPORTANT: 
    // Line 1: Company name
    // Line 2: Street address (from Airtable Company Address)
    // Line 3: City, State ZIP (from Airtable Company Address)
    taxpayerName: companyFullName,
    taxpayerSSN: '', // Company EIN will be filled later
    taxpayerAddress: companyAddress, // Street address for Line 2
    taxpayerAddressLine2: '', // Not used - city/state/zip goes on Line 3
    taxpayerCity: companyCity, // For Line 3
    taxpayerState: companyState, // For Line 3
    taxpayerZip: companyZip, // For Line 3
    taxpayerPhone: companyPhone,
    
    // Box 2: Third Party Designee (Antonio Regojo - Lawyer)
    designeeName: 'ANTONIO REGOJO',
    designeeAddress: '10634 NE 11 AVE.',
    designeeCity: 'MIAMI',
    designeeState: 'FL',
    designeeZip: '33138',
    designeePhone: '786-512-0434', // Antonio Regojo phone
    designeeFax: '866-496-4957', // Antonio Regojo fax
    
    // Authorization details - Section 3 always "N/A", Section 4 always checked
    // These fields are hardcoded in Lambda to always be "N/A"
    taxInfo: 'N/A', // Always "N/A"
    taxForms: 'N/A', // Always "N/A"
    taxYears: 'N/A', // Always "N/A"
    taxMatters: 'N/A', // Always "N/A"
    
    // Signature information
    signatureName: signatureName,
    signatureTitle: signatureTitle,
  };
  
  // Debug logging
  console.log('📝 8821 Transform Data:', {
    taxpayerName: transformedData.taxpayerName,
    taxpayerAddress: transformedData.taxpayerAddress,
    taxpayerCity: transformedData.taxpayerCity,
    taxpayerState: transformedData.taxpayerState,
    taxpayerZip: transformedData.taxpayerZip,
    signatureName: transformedData.signatureName,
    signatureTitle: transformedData.signatureTitle,
  });
  
  return transformedData;
}

/**
 * Calls a Lambda function to fill out a PDF form
 */
async function callLambdaFunction(
  lambdaUrl: string,
  templateUrl: string,
  data: any,
  s3Bucket: string,
  s3Key: string
): Promise<Buffer> {
  console.log(`📞 Calling Lambda: ${lambdaUrl}`);
  console.log(`📄 Template: ${templateUrl}`);
  console.log(`📋 Data keys: ${Object.keys(data).join(', ')}`);
  console.log(`📋 Data sample:`, JSON.stringify(data, null, 2).substring(0, 500));
  console.log(`📦 S3 Destination: s3://${s3Bucket}/${s3Key}`);
  
  try {
    // Lambda functions expect 'form_data', 's3_bucket', 's3_key', and 'templateUrl'
    const payload: any = {
      form_data: data,
      s3_bucket: s3Bucket,
      s3_key: s3Key,
      templateUrl: templateUrl, // Template URL is required by Lambda functions
      return_pdf: true, // Also return PDF as binary so we can save it
    };
    
    console.log(`📤 Sending payload with form_data (${Object.keys(data).length} keys)`);
    console.log(`📤 Payload keys: ${Object.keys(payload).join(', ')}`);
    
    const response = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    console.log(`📡 Lambda response status: ${response.status} ${response.statusText}`);
    console.log(`📡 Lambda response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Lambda error response:`, errorText);
      throw new Error(`Lambda function failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    // Check content type
    const contentType = response.headers.get('content-type');
    console.log(`📄 Response content-type: ${contentType}`);
    
    // Lambda should return the filled PDF as binary data
    const arrayBuffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    
    console.log(`📦 Received ${pdfBuffer.length} bytes from Lambda`);
    
    if (pdfBuffer.length === 0) {
      throw new Error('Lambda returned empty PDF');
    }
    
    // Validate it's actually a PDF (starts with %PDF)
    if (pdfBuffer.length < 4 || pdfBuffer.subarray(0, 4).toString() !== '%PDF') {
      console.error(`❌ Response doesn't appear to be a PDF. First 100 bytes:`, pdfBuffer.subarray(0, 100).toString());
      throw new Error('Lambda response is not a valid PDF file');
    }
    
    console.log(`✅ Lambda returned valid PDF (${pdfBuffer.length} bytes)`);
    
    return pdfBuffer;
  } catch (error: any) {
    console.error(`❌ Lambda call failed:`, error.message);
    console.error(`❌ Lambda URL: ${lambdaUrl}`);
    console.error(`❌ Template URL: ${templateUrl}`);
    throw error;
  }
}

/**
 * Generates SS-4 PDF (EIN Application)
 */
export async function generateSS4PDF(
  vaultPath: string,
  companyName: string,
  formData: QuestionnaireData
): Promise<PDFGenerationResult> {
  try {
    console.log('📄 Generating SS-4 PDF...');
    
    // Transform data for SS-4
    const data = transformDataForSS4(formData);
    
    // Sanitize company name for filename
    const sanitizedName = companyName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const fileName = `SS-4_${sanitizedName}.pdf`;
    const s3Key = `${vaultPath}/formation/${fileName}`;
    
    // Call Lambda function (Lambda will upload to S3 and return PDF)
    const pdfBuffer = await callLambdaFunction(
      LAMBDA_SS4_URL,
      TEMPLATE_SS4_URL,
      data,
      S3_BUCKET,
      s3Key
    );
    
    // Lambda already uploaded to S3, but we upload again as backup/verification
    // Use the s3Key that Lambda was told to use (it should match)
    const result = await uploadDocument(
      vaultPath,
      'formation',
      fileName,
      pdfBuffer,
      'application/pdf'
    );
    
    console.log(`✅ SS-4 PDF generated and saved: ${result.s3Key}`);
    console.log(`📋 SS-4 s3Key for DynamoDB: ${s3Key}`);
    
    return {
      success: true,
      s3Key: s3Key, // Use the original s3Key that Lambda uploaded to
      fileName: fileName,
      size: result.size,
    };
  } catch (error: any) {
    console.error('❌ Failed to generate SS-4 PDF:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Generates Form 2848 PDF (Power of Attorney)
 */
export async function generate2848PDF(
  vaultPath: string,
  companyName: string,
  formData: QuestionnaireData
): Promise<PDFGenerationResult> {
  try {
    console.log('📄 Generating Form 2848 PDF...');
    
    // Transform data for 2848
    const data = transformDataFor2848(formData);
    
    // Sanitize company name for filename
    const sanitizedName = companyName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const fileName = `2848_${sanitizedName}.pdf`;
    const s3Key = `${vaultPath}/formation/${fileName}`;
    
    // Call Lambda function (Lambda will upload to S3 and return PDF)
    const pdfBuffer = await callLambdaFunction(
      LAMBDA_2848_URL,
      TEMPLATE_2848_URL,
      data,
      S3_BUCKET,
      s3Key
    );
    
    // Lambda already uploaded to S3, but we upload again as backup/verification
    // Use the s3Key that Lambda was told to use (it should match)
    const result = await uploadDocument(
      vaultPath,
      'formation',
      fileName,
      pdfBuffer,
      'application/pdf'
    );
    
    console.log(`✅ Form 2848 PDF generated and saved: ${result.s3Key}`);
    console.log(`📋 2848 s3Key for DynamoDB: ${s3Key}`);
    
    return {
      success: true,
      s3Key: s3Key, // Use the original s3Key that Lambda uploaded to
      fileName: fileName,
      size: result.size,
    };
  } catch (error: any) {
    console.error('❌ Failed to generate Form 2848 PDF:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Generates Form 8821 PDF (Tax Information Authorization)
 */
export async function generate8821PDF(
  vaultPath: string,
  companyName: string,
  formData: QuestionnaireData
): Promise<PDFGenerationResult> {
  try {
    console.log('📄 Generating Form 8821 PDF...');
    
    // Transform data for 8821
    const data = transformDataFor8821(formData);
    
    // Sanitize company name for filename
    const sanitizedName = companyName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const fileName = `8821_${sanitizedName}.pdf`;
    const s3Key = `${vaultPath}/formation/${fileName}`;
    
    // Call Lambda function (Lambda will upload to S3 and return PDF)
    const pdfBuffer = await callLambdaFunction(
      LAMBDA_8821_URL,
      TEMPLATE_8821_URL,
      data,
      S3_BUCKET,
      s3Key
    );
    
    // Lambda already uploaded to S3, but we upload again as backup/verification
    // Use the s3Key that Lambda was told to use (it should match)
    const result = await uploadDocument(
      vaultPath,
      'formation',
      fileName,
      pdfBuffer,
      'application/pdf'
    );
    
    console.log(`✅ Form 8821 PDF generated and saved: ${result.s3Key}`);
    console.log(`📋 8821 s3Key for DynamoDB: ${s3Key}`);
    
    return {
      success: true,
      s3Key: s3Key, // Use the original s3Key that Lambda uploaded to
      fileName: fileName,
      size: result.size,
    };
  } catch (error: any) {
    console.error('❌ Failed to generate Form 8821 PDF:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Generates all three tax forms (SS-4, 2848, 8821)
 */
export async function generateAllTaxForms(
  vaultPath: string,
  companyName: string,
  formData: QuestionnaireData
): Promise<{
  ss4: PDFGenerationResult;
  form2848: PDFGenerationResult;
  form8821: PDFGenerationResult;
}> {
  console.log('📋 Generating all tax forms...');
  
  // Generate all three PDFs in parallel
  const [ss4, form2848, form8821] = await Promise.all([
    generateSS4PDF(vaultPath, companyName, formData),
    generate2848PDF(vaultPath, companyName, formData),
    generate8821PDF(vaultPath, companyName, formData),
  ]);
  
  const successCount = [ss4, form2848, form8821].filter(r => r.success).length;
  console.log(`✅ Generated ${successCount}/3 tax forms`);
  
  return {
    ss4,
    form2848,
    form8821,
  };
}

