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
    return 'STARTED NEW BUSINESS';
  }

  // For most new businesses, default to "Started new business"
  // Only use OpenAI if we need to determine a specific reason

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
            content: 'You are a helpful assistant that generates reasons for applying for an EIN on IRS Form SS-4, Line 10. Return only the reason text, no labels or explanations.',
          },
          {
            role: 'user',
            content: `This is for IRS Form SS-4, Line 10 "Reason for applying". Generate a brief reason using standard IRS reasons such as:
- "Started new business"
- "Hired employees"
- "Opened bank account"
- "Changed type of organization"
- "Purchased going business"
- "Created a trust"
- "Other"

Based on this business purpose: "${businessPurpose}"

Generate the reason for applying. Maximum 45 characters. Return ONLY the reason text (e.g., "Started new business"), no labels, no prefixes, no explanations. For most new businesses, use "Started new business".`,
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
  
  // Parse company address
  const companyAddress = fields['Company Address'] || '';
  const addressParts = parseAddress(companyAddress);
  
  // Parse responsible party address
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
    // Line 1: Legal name of entity
    companyName: fields['Company Name'] || '',
    companyNameBase: (fields['Company Name'] || '').replace(/\s+(LLC|Inc|Corp|Corporation|L\.L\.C\.|Incorporated)$/i, '').trim(),
    
    // Line 2: Trade name (usually same as company name)
    tradeName: '',
    
    // Entity information
    entityType: entityType,
    formationState: (fields['Formation State'] || 'Florida').toUpperCase(), // Lambda expects uppercase for Line 9b
    
    // Line 4a-4b: Mailing address (Avenida Legal address - hardcoded)
    // Line 5a-5b: Street address (Company Address from Airtable)
    // Pass the full Company Address string so Lambda can parse it for Line 5a (street) and Line 5b (city, state, zip)
    companyAddress: companyAddress, // Full address string: "Street, City, State ZIP"
    mailingAddressLine1: addressParts.line1,
    mailingAddressLine2: addressParts.line2,
    mailingCity: addressParts.city,
    mailingState: addressParts.state,
    mailingZip: addressParts.zip,
    mailingCountry: addressParts.country || 'US',
    
    // Line 5a-5b: Street address (Company Address from Airtable - Lambda will parse this)
    streetAddressLine1: addressParts.line1, // For reference, but Lambda uses companyAddress
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
    
    // Line 9b: State of incorporation (for corps) or Formation State (for LLCs) - ALL CAPS from Formation State column
    // Lambda uses formationState for Line 9b for all entity types
    stateOfIncorporation: isCorp ? ((fields['Formation State'] || 'FL').toUpperCase()) : undefined,
    // Also pass formationState directly (Lambda uses this for Line 9b)
    // formationState is already set above, but ensure it's uppercase for Lambda
    
    // Line 10: Summarized Business Purpose (max 45 characters, ALL CAPS)
    // This will be set after OpenAI summarization
    
    // Line 11: Date business started (use Payment Date from Airtable)
    dateBusinessStarted: fields['Payment Date'] || new Date().toISOString().split('T')[0],
    paymentDate: fields['Payment Date'] || new Date().toISOString().split('T')[0], // Also pass as paymentDate for Lambda fallback
    
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
    
    // Line 18: Third Party Designee (Antonio Regojo)
    // For C-Corp, add officer title; for LLC and others, just "ANTONIO REGOJO"
    // Lambda will convert to uppercase, but we ensure it's formatted correctly
    designeeName: isCorp && entityType === 'C-Corp' && responsiblePartyOfficerRole 
      ? `Antonio Regojo, ${responsiblePartyOfficerRole}` 
      : 'Antonio Regojo',
    designeeAddress: '10634 NE 11 AVE, MIAMI, FL, 33138',
    designeePhone: '(786) 512-0434',  // Updated phone number
    designeeFax: '866-496-4957',
    
    // Signature information
    signatureName: signatureName,
    signatureTitle: isLLC ? 'Member/Manager' : 'President',
    // Applicant Phone: Use Business Phone from Airtable Formations table
    applicantPhone: fields['Business Phone'] || '',
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
  console.log('📋 Critical fields:', {
    companyName: formData.companyName,
    companyAddress: formData.companyAddress,
    entityType: formData.entityType,
    isLLC: formData.isLLC,
    llcMemberCount: formData.llcMemberCount,
    responsiblePartyName: formData.responsiblePartyName,
    responsiblePartySSN: formData.responsiblePartySSN,
    paymentDate: formData.paymentDate,
    dateBusinessStarted: formData.dateBusinessStarted,
    summarizedBusinessPurpose: formData.summarizedBusinessPurpose,
    line16Category: formData.line16Category,
    line17PrincipalMerchandise: formData.line17PrincipalMerchandise,
    applicantPhone: formData.applicantPhone,
    signatureName: formData.signatureName,
  });
  
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
    console.error(`❌ Lambda error response: ${errorText}`);
    throw new Error(`Lambda failed: ${response.status} - ${errorText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  console.log(`✅ Received PDF from Lambda: ${arrayBuffer.byteLength} bytes`);
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
    console.log(`📋 Airtable fields check:`, {
      companyName: fields['Company Name'] || 'MISSING',
      companyAddress: fields['Company Address'] || 'MISSING',
      entityType: fields['Entity Type'] || 'MISSING',
      formationState: fields['Formation State'] || 'MISSING',
      businessPurpose: fields['Business Purpose'] ? `${fields['Business Purpose'].substring(0, 50)}...` : 'MISSING',
      paymentDate: fields['Payment Date'] || 'MISSING',
      businessPhone: fields['Business Phone'] || 'MISSING',
      ownerCount: fields['Owner Count'] || 'MISSING',
      owner1Name: fields['Owner 1 Name'] || 'MISSING',
      owner1SSN: fields['Owner 1 SSN'] || 'MISSING',
    });
    
    // Step 2: Map Airtable fields to SS-4 format (async - includes OpenAI summarization)
    const ss4Data = await mapAirtableToSS4(record);
    
    // Step 2a: Summarize Business Purpose for Line 10, categorize for Line 16, and analyze for Line 17
    const businessPurpose = fields['Business Purpose'] || 'General business operations';
    const [summarizedBusinessPurpose, line16Category, line17Content] = await Promise.all([
      summarizeBusinessPurpose(businessPurpose),
      categorizeBusinessPurposeForLine16(businessPurpose),
      analyzeBusinessPurposeForLine17(businessPurpose),
    ]);
    
    ss4Data.summarizedBusinessPurpose = summarizedBusinessPurpose; // For Line 10
    ss4Data.line16Category = line16Category.category; // For Line 16 checkbox
    ss4Data.line16OtherSpecify = line16Category.otherSpecify; // For Line 16 "Other" specification
    ss4Data.line17PrincipalMerchandise = line17Content; // For Line 17
    
    console.log('📋 Mapped SS-4 data:', {
      companyName: ss4Data.companyName,
      companyAddress: ss4Data.companyAddress,
      responsibleParty: ss4Data.responsiblePartyName,
      responsiblePartySSN: ss4Data.responsiblePartySSN,
      entityType: ss4Data.entityType,
      isLLC: ss4Data.isLLC,
      llcMemberCount: ss4Data.llcMemberCount,
      paymentDate: ss4Data.paymentDate,
      dateBusinessStarted: ss4Data.dateBusinessStarted,
      summarizedBusinessPurpose: ss4Data.summarizedBusinessPurpose,
      line16Category: ss4Data.line16Category,
      line16OtherSpecify: ss4Data.line16OtherSpecify,
      line17PrincipalMerchandise: ss4Data.line17PrincipalMerchandise,
      applicantPhone: ss4Data.applicantPhone,
      signatureName: ss4Data.signatureName,
    });
    
    // Log ALL keys to verify nothing is missing
    console.log('📋 All ss4Data keys:', Object.keys(ss4Data).sort().join(', '));
    
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
    const [summarizedBusinessPurpose, line16Category, line17Content] = await Promise.all([
      summarizeBusinessPurpose(businessPurpose),
      categorizeBusinessPurposeForLine16(businessPurpose),
      analyzeBusinessPurposeForLine17(businessPurpose),
    ]);
    ss4Data.summarizedBusinessPurpose = summarizedBusinessPurpose;
    ss4Data.line16Category = line16Category.category;
    ss4Data.line16OtherSpecify = line16Category.otherSpecify;
    ss4Data.line17PrincipalMerchandise = line17Content;
    
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





