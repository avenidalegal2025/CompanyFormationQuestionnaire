import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || '';

// Lambda and S3 configuration
const LAMBDA_SS4_URL = process.env.LAMBDA_SS4_URL || 'https://sk5p2uuxrdubzaf2uh7vvqc2bu0kcaoz.lambda-url.us-west-1.on.aws/';
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
 * Categorize Business Purpose for Line 16 (principal activity checkbox)
 * Returns category name and optional "other" specification
 */
async function categorizeBusinessPurposeForLine16(businessPurpose: string): Promise<{ category: string; otherSpecify?: string }> {
  if (!businessPurpose || businessPurpose.trim() === '') {
    return { category: 'other', otherSpecify: 'GENERAL BUSINESS' };
  }

  // If no OpenAI API key, fallback to simple keyword matching
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured, using keyword matching fallback for Line 16');
    return categorizeByKeywords(businessPurpose);
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
            content: 'You are a helpful assistant that categorizes business purposes. Return only a JSON object with "category" (one of: construction, rental, transportation, healthcare, accommodation, wholesale_broker, wholesale_other, retail, real_estate, manufacturing, finance, other) and optionally "otherSpecify" (max 45 chars) if category is "other".',
          },
          {
            role: 'user',
            content: `Categorize this business purpose into one of these categories: Construction, Rental & leasing, Transportation & warehousing, Health care & social assistance, Accommodation & food service, Wholesale—agent/broker, Wholesale—other, Retail, Real estate, Manufacturing, Finance & insurance, or Other. If "Other", provide a 45-character max description of the category. Return JSON only: "${businessPurpose}"`,
          },
        ],
        max_tokens: 100,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ OpenAI API error for Line 16: ${response.status} - ${errorText}`);
      return categorizeByKeywords(businessPurpose);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content?.trim() || '';
    
    if (!resultText) {
      return categorizeByKeywords(businessPurpose);
    }

    try {
      const result = JSON.parse(resultText);
      const category = result.category || 'other';
      const otherSpecify = result.otherSpecify ? result.otherSpecify.substring(0, 45).toUpperCase() : undefined;
      
      return { category, otherSpecify };
    } catch (parseError) {
      console.warn('⚠️ Failed to parse OpenAI response, using keyword matching');
      return categorizeByKeywords(businessPurpose);
    }
  } catch (error: any) {
    console.error('❌ Error calling OpenAI API for Line 16:', error);
    return categorizeByKeywords(businessPurpose);
  }
}

/**
 * Fallback keyword-based categorization
 */
function categorizeByKeywords(businessPurpose: string): { category: string; otherSpecify?: string } {
  const purposeLower = businessPurpose.toLowerCase();
  
  if (purposeLower.includes('construction') || purposeLower.includes('building') || purposeLower.includes('contractor')) {
    return { category: 'construction' };
  }
  if (purposeLower.includes('rental') || purposeLower.includes('leasing') || purposeLower.includes('lease')) {
    return { category: 'rental' };
  }
  if (purposeLower.includes('transportation') || purposeLower.includes('warehousing') || purposeLower.includes('logistics') || purposeLower.includes('shipping')) {
    return { category: 'transportation' };
  }
  if (purposeLower.includes('health') || purposeLower.includes('medical') || purposeLower.includes('hospital') || purposeLower.includes('clinic')) {
    return { category: 'healthcare' };
  }
  if (purposeLower.includes('restaurant') || purposeLower.includes('hotel') || purposeLower.includes('accommodation') || purposeLower.includes('food service') || purposeLower.includes('catering')) {
    return { category: 'accommodation' };
  }
  if (purposeLower.includes('wholesale') && (purposeLower.includes('broker') || purposeLower.includes('agent'))) {
    return { category: 'wholesale_broker' };
  }
  if (purposeLower.includes('wholesale')) {
    return { category: 'wholesale_other' };
  }
  if (purposeLower.includes('retail') || purposeLower.includes('store') || purposeLower.includes('shop')) {
    return { category: 'retail' };
  }
  if (purposeLower.includes('real estate') || purposeLower.includes('realty') || purposeLower.includes('property')) {
    return { category: 'real_estate' };
  }
  if (purposeLower.includes('manufacturing') || purposeLower.includes('production') || purposeLower.includes('factory')) {
    return { category: 'manufacturing' };
  }
  if (purposeLower.includes('finance') || purposeLower.includes('financial') || purposeLower.includes('insurance') || purposeLower.includes('banking') || purposeLower.includes('investment')) {
    return { category: 'finance' };
  }
  
  // Default to "other" with truncated business purpose
  const otherSpecify = businessPurpose.substring(0, 45).toUpperCase();
  return { category: 'other', otherSpecify };
}

/**
 * Analyze Business Purpose and generate Line 17 content (principal line of merchandise/construction/products/services)
 * Max 168 characters, ALL CAPS
 */
async function analyzeBusinessPurposeForLine17(businessPurpose: string): Promise<string> {
  if (!businessPurpose || businessPurpose.trim() === '') {
    return '';
  }

  // If no OpenAI API key, fallback to truncation
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured, using truncation fallback for Line 17');
    return businessPurpose.substring(0, 168).toUpperCase();
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
            content: 'You are a helpful assistant that analyzes business purposes and extracts specific information. Return only the extracted information, no explanations.',
          },
          {
            role: 'user',
            content: `Analyze this business purpose and indicate the principal line of merchandise sold, specific construction work done, products produced, or services provided. Be specific and concise. Maximum 168 characters. Return only the description, no labels or prefixes: "${businessPurpose}"`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ OpenAI API error for Line 17: ${response.status} - ${errorText}`);
      // Fallback to truncation
      return businessPurpose.substring(0, 168).toUpperCase();
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() || '';
    
    if (!analysis) {
      return businessPurpose.substring(0, 168).toUpperCase();
    }

    // Ensure it's max 168 characters
    const finalAnalysis = analysis.length > 168 
      ? analysis.substring(0, 168).trim()
      : analysis.trim();
    
    return finalAnalysis.toUpperCase();
  } catch (error: any) {
    console.error('❌ Error calling OpenAI API for Line 17:', error);
    // Fallback to truncation
    return businessPurpose.substring(0, 168).toUpperCase();
  }
}

/**
 * Map Airtable Formations record to SS-4 form data format
 */
async function mapAirtableToSS4(record: any): Promise<any> {
  const fields = record.fields || record;
  
  // Determine entity type first
  const entityType = fields['Entity Type'] || 'LLC';
  const isLLC = entityType === 'LLC';
  const isCorp = entityType === 'C-Corp' || entityType === 'S-Corp';
  
  // Find the responsible party for Line 7a and 7b
  // For C-Corp: Must be an officer
  // For LLC: Can be any owner/manager
  let responsiblePartyName = '';
  let responsiblePartyFirstName = '';
  let responsiblePartyLastName = '';
  let responsiblePartySSN = '';
  let responsiblePartyAddress = '';
  let responsiblePartyOfficerRole = ''; // Officer role for C-Corp (for designee name)
  
  if (isCorp) {
    // For C-Corp, responsible party must be an officer
    // First, check if there's a tax owner specified (from agreement.corp_taxOwner)
    const taxOwnerName = fields['Corp Tax Owner'] || '';
    
    // Get officers count
    const officersCount = fields['Officers Count'] || 0;
    const officersAllOwners = fields['Officers All Owners'] === 'Yes' || fields['Officers All Owners'] === true;
    
    // If tax owner is specified, try to find them in officers
    if (taxOwnerName) {
      if (officersAllOwners) {
        // All owners are officers, search in owners
        const ownerCount = fields['Owner Count'] || 1;
        for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
          const ownerName = fields[`Owner ${i} Name`] || '';
          if (ownerName === taxOwnerName) {
            const ownerSSN = fields[`Owner ${i} SSN`] || '';
            responsiblePartyName = ownerName;
            responsiblePartyFirstName = fields[`Owner ${i} First Name`] || '';
            responsiblePartyLastName = fields[`Owner ${i} Last Name`] || '';
            responsiblePartySSN = (ownerSSN && ownerSSN.trim() !== '' && 
                                   ownerSSN.toUpperCase() !== 'N/A' && 
                                   !ownerSSN.toUpperCase().includes('FOREIGN')) 
                                   ? ownerSSN : 'N/A-FOREIGN';
            responsiblePartyAddress = fields[`Owner ${i} Address`] || '';
            // Find officer role - if all owners are officers, find the role
            for (let k = 1; k <= Math.min(officersCount, 6); k++) {
              const officerName = fields[`Officer ${k} Name`] || '';
              if (officerName === ownerName) {
                responsiblePartyOfficerRole = fields[`Officer ${k} Role`] || 'President';
                break;
              }
            }
            // If not found in officers list but all owners are officers, default to President
            if (!responsiblePartyOfficerRole) {
              responsiblePartyOfficerRole = 'President';
            }
            break;
          }
        }
      } else {
        // Specific officers listed, search in officers
        for (let i = 1; i <= Math.min(officersCount, 6); i++) {
          const officerName = fields[`Officer ${i} Name`] || '';
          if (officerName === taxOwnerName) {
            // Officer found, but we need to get their SSN from owners
            // Match by name to find the owner's SSN
            const ownerCount = fields['Owner Count'] || 1;
            for (let j = 1; j <= Math.min(ownerCount, 6); j++) {
              const ownerName = fields[`Owner ${j} Name`] || '';
              if (ownerName === officerName) {
                const ownerSSN = fields[`Owner ${j} SSN`] || '';
                responsiblePartyName = officerName;
                responsiblePartyFirstName = fields[`Officer ${i} First Name`] || fields[`Owner ${j} First Name`] || '';
                responsiblePartyLastName = fields[`Officer ${i} Last Name`] || fields[`Owner ${j} Last Name`] || '';
                responsiblePartySSN = (ownerSSN && ownerSSN.trim() !== '' && 
                                     ownerSSN.toUpperCase() !== 'N/A' && 
                                     !ownerSSN.toUpperCase().includes('FOREIGN')) 
                                     ? ownerSSN : 'N/A-FOREIGN';
                responsiblePartyAddress = fields[`Officer ${i} Address`] || fields[`Owner ${j} Address`] || '';
                // Get officer role
                responsiblePartyOfficerRole = fields[`Officer ${i} Role`] || 'President';
                break;
              }
            }
            if (responsiblePartyName) break;
          }
        }
      }
    }
    
    // If tax owner not found or not specified, find first officer with SSN
    if (!responsiblePartyName) {
      if (officersAllOwners) {
        // All owners are officers, search for first owner with SSN
        const ownerCount = fields['Owner Count'] || 1;
        for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
          const ownerSSN = fields[`Owner ${i} SSN`] || '';
          if (ownerSSN && ownerSSN.trim() !== '' && 
              ownerSSN.toUpperCase() !== 'N/A' && 
              !ownerSSN.toUpperCase().includes('FOREIGN')) {
            responsiblePartyName = fields[`Owner ${i} Name`] || '';
            responsiblePartyFirstName = fields[`Owner ${i} First Name`] || '';
            responsiblePartyLastName = fields[`Owner ${i} Last Name`] || '';
            responsiblePartySSN = ownerSSN;
            responsiblePartyAddress = fields[`Owner ${i} Address`] || '';
            // Find officer role - if all owners are officers, find the role
            for (let k = 1; k <= Math.min(officersCount, 6); k++) {
              const officerName = fields[`Officer ${k} Name`] || '';
              if (officerName === responsiblePartyName) {
                responsiblePartyOfficerRole = fields[`Officer ${k} Role`] || 'President';
                break;
              }
            }
            // If not found, default to President
            if (!responsiblePartyOfficerRole) {
              responsiblePartyOfficerRole = 'President';
            }
            break;
          }
        }
      } else {
        // Specific officers, find first officer with SSN (match to owner for SSN)
        for (let i = 1; i <= Math.min(officersCount, 6); i++) {
          const officerName = fields[`Officer ${i} Name`] || '';
          if (officerName) {
            // Match officer to owner to get SSN
            const ownerCount = fields['Owner Count'] || 1;
            for (let j = 1; j <= Math.min(ownerCount, 6); j++) {
              const ownerName = fields[`Owner ${j} Name`] || '';
              if (ownerName === officerName) {
                const ownerSSN = fields[`Owner ${j} SSN`] || '';
                if (ownerSSN && ownerSSN.trim() !== '' && 
                    ownerSSN.toUpperCase() !== 'N/A' && 
                    !ownerSSN.toUpperCase().includes('FOREIGN')) {
                  responsiblePartyName = officerName;
                  responsiblePartyFirstName = fields[`Officer ${i} First Name`] || fields[`Owner ${j} First Name`] || '';
                  responsiblePartyLastName = fields[`Officer ${i} Last Name`] || fields[`Owner ${j} Last Name`] || '';
                  responsiblePartySSN = ownerSSN;
                  responsiblePartyAddress = fields[`Officer ${i} Address`] || fields[`Owner ${j} Address`] || '';
                  // Get officer role
                  responsiblePartyOfficerRole = fields[`Officer ${i} Role`] || 'President';
                  break;
                }
              }
            }
            if (responsiblePartySSN) break;
          }
        }
      }
    }
    
    // If still no responsible party found, use first officer (even without SSN)
    if (!responsiblePartyName) {
      if (officersAllOwners) {
        responsiblePartyName = fields['Owner 1 Name'] || fields['Customer Name'] || '';
        responsiblePartyFirstName = fields['Owner 1 First Name'] || '';
        responsiblePartyLastName = fields['Owner 1 Last Name'] || '';
        responsiblePartySSN = 'N/A-FOREIGN';
        responsiblePartyAddress = fields['Owner 1 Address'] || '';
        // Find officer role
        for (let k = 1; k <= Math.min(officersCount, 6); k++) {
          const officerName = fields[`Officer ${k} Name`] || '';
          if (officerName === responsiblePartyName) {
            responsiblePartyOfficerRole = fields[`Officer ${k} Role`] || 'President';
            break;
          }
        }
        if (!responsiblePartyOfficerRole) {
          responsiblePartyOfficerRole = 'President';
        }
      } else if (officersCount > 0) {
        responsiblePartyName = fields['Officer 1 Name'] || fields['Customer Name'] || '';
        responsiblePartyFirstName = fields['Officer 1 First Name'] || '';
        responsiblePartyLastName = fields['Officer 1 Last Name'] || '';
        responsiblePartySSN = 'N/A-FOREIGN';
        responsiblePartyAddress = fields['Officer 1 Address'] || '';
        responsiblePartyOfficerRole = fields['Officer 1 Role'] || 'President';
      }
    }
  } else {
    // For LLC, use owner/manager logic (existing code)
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
  }
  
  const companyAddress = fields['Company Address'] || '';
  const addressParts = parseAddress(companyAddress);
  const rpAddressParts = parseAddress(responsiblePartyAddress);
  
  // ownerCount for signature name calculation
  const ownerCount = fields['Owner Count'] || 1;
  
  // Signature Name: Same as Line 7a, add ",SOLE MEMBER" if single member LLC, or ",MEMBER" if multiple members
  let signatureName = responsiblePartyName || `${responsiblePartyFirstName} ${responsiblePartyLastName}`.trim();
  if (isLLC) {
    if (ownerCount === 1) {
      signatureName = `${signatureName},SOLE MEMBER`;
    } else {
      signatureName = `${signatureName},MEMBER`;
    }
  }
  
  return {
    companyName: fields['Company Name'] || '',
    companyNameBase: (fields['Company Name'] || '').replace(/\s+(LLC|Inc|Corp|Corporation|L\.L\.C\.|Incorporated)$/i, '').trim(),
    tradeName: '',
    entityType: entityType,
    formationState: fields['Formation State'] || 'Florida',
    companyAddress: companyAddress,
    mailingAddressLine1: addressParts.line1,
    mailingAddressLine2: addressParts.line2,
    mailingCity: addressParts.city,
    mailingState: addressParts.state,
    mailingZip: addressParts.zip,
    mailingCountry: addressParts.country || 'US',
    streetAddressLine1: addressParts.line1,
    streetAddressLine2: addressParts.line2,
    streetCity: addressParts.city,
    streetState: addressParts.state,
    streetZip: addressParts.zip,
    countyState: `${addressParts.city || ''}, ${addressParts.state || 'FL'}`,
    responsiblePartyName: responsiblePartyName || `${responsiblePartyFirstName} ${responsiblePartyLastName}`.trim(),
    responsiblePartyFirstName: responsiblePartyFirstName || responsiblePartyName.split(' ')[0] || '',
    responsiblePartyLastName: responsiblePartyLastName || responsiblePartyName.split(' ').slice(1).join(' ') || '',
    responsiblePartySSN: responsiblePartySSN,
    responsiblePartyAddress: responsiblePartyAddress,
    responsiblePartyCity: rpAddressParts.city,
    responsiblePartyState: rpAddressParts.state,
    responsiblePartyZip: rpAddressParts.zip,
    responsiblePartyCountry: rpAddressParts.country || 'US',
    isLLC: isLLC ? 'Yes' : 'No',
    llcMemberCount: isLLC ? ownerCount : undefined,
    entityTypeCode: getEntityTypeCode(entityType),
    stateOfIncorporation: isCorp ? ((fields['Formation State'] || 'FL').toUpperCase()) : undefined,
    // Line 10: Summarized Business Purpose (will be set after OpenAI summarization)
    reasonForApplying: 'Started new business',
    dateBusinessStarted: fields['Payment Date'] || new Date().toISOString().split('T')[0],
    paymentDate: fields['Payment Date'] || new Date().toISOString().split('T')[0], // Also pass as paymentDate for Lambda fallback
    closingMonth: 'December',
    expectedEmployees: { agricultural: '0', household: '0', other: '0' },
    firstWagesDate: 'N/A',
    businessPurpose: fields['Business Purpose'] || 'General business operations',
    principalActivity: fields['Business Purpose'] || 'General business operations',
    principalMerchandise: '',
    appliedBefore: 'No',
    // Designee Name: For C-Corp, add officer title (President or whoever has SSN)
    designeeName: isCorp && entityType === 'C-Corp' && responsiblePartyOfficerRole 
      ? `Antonio Regojo, ${responsiblePartyOfficerRole}` 
      : 'Antonio Regojo',
    responsiblePartyOfficerRole: responsiblePartyOfficerRole || '',
    designeeAddress: '10634 NE 11 AVE, MIAMI, FL, 33138',
    designeePhone: '(786) 512-0434',  // Updated phone number
    designeeFax: '866-496-4957',
    // Signature information
    signatureName: signatureName,
    signatureTitle: isLLC ? 'Member/Manager' : 'President',
    // Applicant Phone: Use Business Phone from Airtable Formations table
    applicantPhone: fields['Business Phone'] || '',
    applicantFax: '',
    ownerCount: ownerCount,
    customerEmail: fields['Customer Email'] || '',
    customerName: fields['Customer Name'] || '',
    vaultPath: fields['Vault Path'] || '',
  };
}

function parseAddress(addressStr: string): {
  line1: string; line2: string; city: string; state: string; zip: string; country: string;
} {
  if (!addressStr) {
    return { line1: '', line2: '', city: '', state: '', zip: '', country: 'US' };
  }
  
  const parts = addressStr.split(',').map(p => p.trim());
  
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)?/);
    
    if (stateZipMatch) {
      return {
        line1: parts[0] || '',
        line2: parts.length > 3 ? parts.slice(1, -2).join(', ') : '',
        city: parts[parts.length - 2] || '',
        state: stateZipMatch[1],
        zip: stateZipMatch[2] || '',
        country: 'US',
      };
    }
  }
  
  return { line1: addressStr, line2: '', city: '', state: '', zip: '', country: 'US' };
}

function getEntityTypeCode(entityType: string): string {
  switch (entityType?.toUpperCase()) {
    case 'LLC': return 'LLC';
    case 'C-CORP': case 'CORPORATION': return 'Corporation';
    case 'S-CORP': return 'S Corporation';
    case 'PARTNERSHIP': return 'Partnership';
    default: return 'Other';
  }
}

function sanitizeCompanyName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').substring(0, 50).toLowerCase();
}

/**
 * Fetch records from Airtable with optional filter
 */
async function fetchAirtableRecords(filter?: string, maxRecords?: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const records: any[] = [];
    const options: any = {};
    
    if (filter) {
      options.filterByFormula = filter;
    }
    if (maxRecords) {
      options.maxRecords = maxRecords;
    }
    
    base(AIRTABLE_TABLE_NAME)
      .select(options)
      .eachPage(
        (pageRecords, fetchNextPage) => {
          records.push(...pageRecords);
          fetchNextPage();
        },
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(records);
          }
        }
      );
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
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Call Lambda function to generate SS-4 PDF
 */
async function callSS4Lambda(formData: any, s3Bucket: string, s3Key: string): Promise<Buffer> {
  const payload = {
    form_data: formData,
    s3_bucket: s3Bucket,
    s3_key: s3Key,
    templateUrl: TEMPLATE_SS4_URL,
    return_pdf: true,
  };
  
  const response = await fetch(LAMBDA_SS4_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lambda failed: ${response.status} - ${errorText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Process a single record
 */
async function processRecord(record: any): Promise<{
  recordId: string;
  companyName: string;
  success: boolean;
  s3Key?: string;
  error?: string;
}> {
  const recordId = record.id;
  const companyName = record.fields['Company Name'] || 'Unknown';
  
  try {
    const ss4Data = await mapAirtableToSS4(record);
    
    // Summarize Business Purpose for Line 10, categorize for Line 16, and analyze for Line 17
    const businessPurpose = record.fields['Business Purpose'] || 'General business operations';
    const [summarizedBusinessPurpose, line16Category, line17Content] = await Promise.all([
      summarizeBusinessPurpose(businessPurpose),
      categorizeBusinessPurposeForLine16(businessPurpose),
      analyzeBusinessPurposeForLine17(businessPurpose),
    ]);
    
    ss4Data.summarizedBusinessPurpose = summarizedBusinessPurpose; // For Line 10
    ss4Data.line16Category = line16Category.category; // For Line 16 checkbox
    ss4Data.line16OtherSpecify = line16Category.otherSpecify; // For Line 16 "Other" specification
    ss4Data.line17PrincipalMerchandise = line17Content; // For Line 17
    const vaultPath = record.fields['Vault Path'] || sanitizeCompanyName(companyName);
    const fileName = `SS-4_${sanitizeCompanyName(companyName)}.pdf`;
    const s3Key = `${vaultPath}/formation/${fileName}`;
    
    const pdfBuffer = await callSS4Lambda(ss4Data, S3_BUCKET, s3Key);
    await updateAirtableWithSS4Url(recordId, s3Key);
    
    return {
      recordId,
      companyName,
      success: true,
      s3Key,
    };
  } catch (error: any) {
    return {
      recordId,
      companyName,
      success: false,
      error: error.message,
    };
  }
}

/**
 * POST /api/airtable/generate-ss4-batch
 * 
 * Generate SS-4 PDFs for multiple Airtable records
 * 
 * Body options:
 * - recordIds: Array of specific record IDs to process
 * - filter: Airtable formula to filter records (e.g., "{SS-4 URL} = ''")
 * - maxRecords: Maximum number of records to process (default: 10)
 * - missingOnly: Only process records without SS-4 URL (default: true)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      recordIds, 
      filter, 
      maxRecords = 10, 
      missingOnly = true 
    } = body;
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 });
    }
    
    let records: any[] = [];
    
    if (recordIds && Array.isArray(recordIds) && recordIds.length > 0) {
      // Fetch specific records by ID
      console.log(`📋 Fetching ${recordIds.length} specific records...`);
      for (const recordId of recordIds) {
        try {
          const record = await new Promise((resolve, reject) => {
            base(AIRTABLE_TABLE_NAME).find(recordId, (err, rec) => {
              if (err) reject(err);
              else resolve(rec);
            });
          });
          records.push(record);
        } catch (err) {
          console.error(`❌ Failed to fetch record ${recordId}:`, err);
        }
      }
    } else {
      // Fetch records with filter
      let airtableFilter = filter || '';
      
      // If missingOnly is true, add filter for records without SS-4 URL
      if (missingOnly && !filter) {
        airtableFilter = "OR({SS-4 URL} = '', {SS-4 URL} = BLANK())";
      }
      
      console.log(`📋 Fetching records with filter: ${airtableFilter || '(none)'}`);
      records = await fetchAirtableRecords(airtableFilter, maxRecords);
    }
    
    console.log(`✅ Found ${records.length} records to process`);
    
    if (records.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No records to process',
        processed: 0,
        results: [],
      });
    }
    
    // Process records sequentially to avoid overwhelming Lambda
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    for (const record of records) {
      console.log(`🔄 Processing: ${record.fields['Company Name']}...`);
      const result = await processRecord(record);
      results.push(result);
      
      if (result.success) {
        successCount++;
        console.log(`✅ ${result.companyName}: Success`);
      } else {
        failCount++;
        console.log(`❌ ${result.companyName}: ${result.error}`);
      }
      
      // Small delay between records to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return NextResponse.json({
      success: true,
      message: `Processed ${records.length} records: ${successCount} success, ${failCount} failed`,
      processed: records.length,
      successCount,
      failCount,
      results,
    });
    
  } catch (error: any) {
    console.error('❌ Batch SS-4 generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Batch processing failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/airtable/generate-ss4-batch
 * 
 * Preview records that would be processed
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const preview = searchParams.get('preview') === 'true';
  const missingOnly = searchParams.get('missingOnly') !== 'false';
  const maxRecords = parseInt(searchParams.get('maxRecords') || '10', 10);
  
  if (!preview) {
    return NextResponse.json({
      endpoint: '/api/airtable/generate-ss4-batch',
      description: 'Generate SS-4 PDFs for multiple Airtable records',
      method: 'POST',
      body: {
        recordIds: 'Array of specific record IDs (optional)',
        filter: 'Airtable formula filter (optional)',
        maxRecords: 'Max records to process (default: 10)',
        missingOnly: 'Only records without SS-4 URL (default: true)',
      },
      examples: [
        {
          description: 'Process specific records',
          body: { recordIds: ['recAAA', 'recBBB', 'recCCC'] },
        },
        {
          description: 'Process all records missing SS-4',
          body: { missingOnly: true, maxRecords: 20 },
        },
        {
          description: 'Process Florida LLCs only',
          body: { filter: "AND({Formation State} = 'Florida', {Entity Type} = 'LLC')" },
        },
      ],
      preview: 'Add ?preview=true to see which records would be processed',
    });
  }
  
  // Preview mode - show which records would be processed
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 });
    }
    
    const filter = missingOnly ? "OR({SS-4 URL} = '', {SS-4 URL} = BLANK())" : '';
    const records = await fetchAirtableRecords(filter, maxRecords);
    
    return NextResponse.json({
      preview: true,
      filter: filter || '(none)',
      recordCount: records.length,
      records: records.map(r => ({
        recordId: r.id,
        companyName: r.fields['Company Name'],
        entityType: r.fields['Entity Type'],
        state: r.fields['Formation State'],
        customerEmail: r.fields['Customer Email'],
        hasSS4: !!r.fields['SS-4 URL'],
      })),
      message: 'Use POST to process these records',
    });
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch records' },
      { status: 500 }
    );
  }
}





