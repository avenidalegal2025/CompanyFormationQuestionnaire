/**
 * PDF Filler Library
 * 
 * Handles calling Lambda functions to fill out PDF forms (SS-4, 2848, 8821)
 * and saving the filled PDFs to S3.
 */

import { uploadDocument } from './s3-vault';

// Lambda function URLs
const LAMBDA_SS4_URL = process.env.LAMBDA_SS4_URL || 'https://rgkqsugoslrjh4kqq2kzwqfnry0ndryd.lambda-url.us-west-1.on.aws/';
const LAMBDA_2848_URL = process.env.LAMBDA_2848_URL || 'https://z246mmg5ojst6boxjy53ilekii0yualo.lambda-url.us-west-1.on.aws/';
const LAMBDA_8821_URL = process.env.LAMBDA_8821_URL || 'https://ql6ufztnwlohsqexpkm7wu44mu0xovla.lambda-url.us-west-1.on.aws/';

// Template PDF URLs in S3
const TEMPLATE_SS4_URL = process.env.TEMPLATE_SS4_URL || 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/fss4.pdf';
const TEMPLATE_2848_URL = process.env.TEMPLATE_2848_URL || 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f2848.pdf';
const TEMPLATE_8821_URL = process.env.TEMPLATE_8821_URL || 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f8821.pdf';

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
    fullAddress?: string;
    hasUsaAddress?: string | boolean;
    businessPurpose?: string;
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
  const primaryOwner = owners[0] || {};
  
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
    
    // Primary Owner/Responsible Party
    responsiblePartyName: primaryOwner.fullName || '',
    responsiblePartySSN: primaryOwner.ssn || primaryOwner.tin || '',
    responsiblePartyAddress: primaryOwner.address || primaryOwner.addressLine1 || '',
    responsiblePartyCity: primaryOwner.city || '',
    responsiblePartyState: primaryOwner.state || '',
    responsiblePartyZip: primaryOwner.zipCode || '',
    responsiblePartyCountry: primaryOwner.country || 'USA',
    
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
    
    // Tax Owner (Taxpayer)
    taxpayerName: taxOwnerName,
    taxpayerSSN: taxOwner.ssn || taxOwner.tin || '',
    taxpayerAddress: taxOwner.address || taxOwner.addressLine1 || '',
    taxpayerCity: taxOwner.city || '',
    taxpayerState: taxOwner.state || '',
    taxpayerZip: taxOwner.zipCode || '',
    
    // Third Party Designee (Avenida Legal)
    designeeName: 'Avenida Legal',
    designeeAddress: '12550 Biscayne Blvd Ste 110',
    designeeCity: 'North Miami',
    designeeState: 'FL',
    designeeZip: '33181',
    designeePhone: '(305) 123-4567', // Update with actual phone
    designeeFax: '', // If available
    
    // Authorization details
    taxYears: '2024, 2025, 2026', // Current and future years
    taxForms: 'All tax forms and information',
  };
}

/**
 * Calls a Lambda function to fill out a PDF form
 */
async function callLambdaFunction(
  lambdaUrl: string,
  templateUrl: string,
  data: any
): Promise<Buffer> {
  console.log(`📞 Calling Lambda: ${lambdaUrl}`);
  console.log(`📄 Template: ${templateUrl}`);
  console.log(`📋 Data keys: ${Object.keys(data).join(', ')}`);
  console.log(`📋 Data sample:`, JSON.stringify(data, null, 2).substring(0, 500));
  
  try {
    // Lambda functions expect 'form_data' instead of 'data'
    // They also accept 'drive_folder_url' as an alternative, but we're using templateUrl
    const payload = {
      form_data: data,
      templateUrl: templateUrl, // Include templateUrl in case Lambda needs it
    };
    
    console.log(`📤 Sending payload with form_data (${Object.keys(data).length} keys)`);
    
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
    
    // Call Lambda function
    const pdfBuffer = await callLambdaFunction(
      LAMBDA_SS4_URL,
      TEMPLATE_SS4_URL,
      data
    );
    
    // Sanitize company name for filename
    const sanitizedName = companyName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const fileName = `SS-4_${sanitizedName}.pdf`;
    
    // Upload to S3
    const result = await uploadDocument(
      vaultPath,
      'formation',
      fileName,
      pdfBuffer,
      'application/pdf'
    );
    
    console.log(`✅ SS-4 PDF generated and saved: ${result.s3Key}`);
    
    return {
      success: true,
      s3Key: result.s3Key,
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
    
    // Call Lambda function
    const pdfBuffer = await callLambdaFunction(
      LAMBDA_2848_URL,
      TEMPLATE_2848_URL,
      data
    );
    
    // Sanitize company name for filename
    const sanitizedName = companyName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const fileName = `2848_${sanitizedName}.pdf`;
    
    // Upload to S3
    const result = await uploadDocument(
      vaultPath,
      'formation',
      fileName,
      pdfBuffer,
      'application/pdf'
    );
    
    console.log(`✅ Form 2848 PDF generated and saved: ${result.s3Key}`);
    
    return {
      success: true,
      s3Key: result.s3Key,
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
    
    // Call Lambda function
    const pdfBuffer = await callLambdaFunction(
      LAMBDA_8821_URL,
      TEMPLATE_8821_URL,
      data
    );
    
    // Sanitize company name for filename
    const sanitizedName = companyName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    const fileName = `8821_${sanitizedName}.pdf`;
    
    // Upload to S3
    const result = await uploadDocument(
      vaultPath,
      'formation',
      fileName,
      pdfBuffer,
      'application/pdf'
    );
    
    console.log(`✅ Form 8821 PDF generated and saved: ${result.s3Key}`);
    
    return {
      success: true,
      s3Key: result.s3Key,
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

