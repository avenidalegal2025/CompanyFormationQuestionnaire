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
 * Summarize Business Purpose using OpenAI API to max 35 characters
 */
async function summarizeBusinessPurpose(businessPurpose: string): Promise<string> {
  if (!businessPurpose || businessPurpose.trim() === '') {
    return 'STARTED NEW BUSINESS';
  }

  // ALWAYS use OpenAI API if available to generate proper reason
  // If no OpenAI API key, fallback to default
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured, using default "Started new business"');
    return 'STARTED NEW BUSINESS';
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
            content: 'You are a helpful assistant that summarizes business purposes concisely for IRS Form SS-4, Line 10. Return only a brief summary, maximum 35 characters, no labels or explanations.',
          },
          {
            role: 'user',
            content: `This is for IRS Form SS-4, Line 10 "Reason for applying" - the text field next to the "Started new business" checkbox.

Summarize this business purpose from the Airtable Formations table "Business Purpose" column into a SHORT, ONE-LINE summary (maximum 35 characters).

Business Purpose: "${businessPurpose}"

Return ONLY a brief summary of what the business does (e.g., "General architectural services", "Real estate development", "Retail clothing sales"). Maximum 35 characters. No labels, no prefixes, no explanations. Be concise and specific.`,
          },
        ],
        max_tokens: 50,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ OpenAI API error: ${response.status} - ${errorText}`);
      // Fallback to default reason
      return 'STARTED NEW BUSINESS';
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || '';
    
    console.log(`📝 OpenAI generated Line 10 reason: "${summary}"`);
    
    if (!summary || summary.length === 0) {
      console.warn('⚠️ OpenAI returned empty response, using default');
      return 'STARTED NEW BUSINESS';
    }

    // Ensure it's max 35 characters and clean it up
    let finalSummary = summary.trim();
    // Remove any quotes if present
    finalSummary = finalSummary.replace(/^["']|["']$/g, '');
    // Ensure max 35 characters
    if (finalSummary.length > 35) {
      finalSummary = finalSummary.substring(0, 35).trim();
    }
    
    const upperSummary = finalSummary.toUpperCase();
    console.log(`✅ Final Line 10 reason (${upperSummary.length} chars): "${upperSummary}"`);
    return upperSummary;
  } catch (error: any) {
    console.error('❌ Error calling OpenAI API:', error);
    // Fallback to default reason
    return 'STARTED NEW BUSINESS';
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
            content:
              'You are a concise classifier. Return only JSON with keys: "category" and optional "otherSpecify" (max 45 chars, ALL CAPS) if category is "other". Allowed categories: construction, rental, transportation, healthcare, accommodation, wholesale_broker, wholesale_other, retail, real_estate, manufacturing, finance, other. Choose the best fit. If it is about restaurants, hotels, lodging, catering, bars, cafes, food delivery: use accommodation. If it is about selling goods to end customers (shops, ecommerce, stores): use retail. If it is about renting/leasing: rental. If none matches, set category=other and describe in otherSpecify.',
          },
          {
            role: 'user',
            content: `Categorize this business purpose into EXACTLY ONE of these categories: Construction; Rental & leasing; Transportation & warehousing; Health care & social assistance; Accommodation & food service (restaurants, hotels, catering, bars, cafes, food delivery); Wholesale—agent/broker; Wholesale—other; Retail (stores, shops, ecommerce to end customers); Real estate; Manufacturing; Finance & insurance; Other. If "Other", provide a 45-character max description of the category (ALL CAPS). Return ONLY JSON. Business Purpose: "${businessPurpose}"`,
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
 * Max 80 characters, ALL CAPS
 */
async function analyzeBusinessPurposeForLine17(businessPurpose: string): Promise<string> {
  if (!businessPurpose || businessPurpose.trim() === '') {
    return '';
  }

  // IMPORTANT: Translate from Spanish to English first before analyzing
  // OpenAI will handle translation if the text is in Spanish

  // If no OpenAI API key, fallback to truncation
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured, using truncation fallback for Line 17');
    return businessPurpose.substring(0, 80).toUpperCase();
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
            content: `Analyze this business purpose and create a CONCISE SUMMARY (not a raw truncation) of the principal line of merchandise sold, specific construction work done, products produced, or services provided.

CRITICAL RULES:
- If the text is in Spanish, translate it to English first, then create the summary.
- Base the summary ONLY on the actual business purpose text below.
- Do NOT invent or assume a different industry than what is described.
- The summary MUST be 80 characters or less.
- Use abbreviations and short phrases if needed.
- Do NOT cut words in half; shorten by rephrasing instead of chopping.
- Return the summary in ALL CAPS English.

Business Purpose: "${businessPurpose}"

Return ONLY the concise summary (max 80 characters, ALL CAPS English), no labels or prefixes:`,
          },
        ],
        max_tokens: 100, // Reduced to encourage more concise responses
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ OpenAI API error for Line 17: ${response.status} - ${errorText}`);
      // Fallback to truncation
      return businessPurpose.substring(0, 80).toUpperCase();
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() || '';
    
    if (!analysis) {
      return businessPurpose.substring(0, 80).toUpperCase();
    }

    // Ensure it's max 80 characters - if still too long, try to intelligently shorten it
    let finalAnalysis = analysis.trim();
    if (finalAnalysis.length > 80) {
      // Try to find a natural break point (comma, period, or space) near 80 characters
      const targetLength = 80;
      let cutPoint = targetLength;
      
      // Look for a comma or period before the limit
      const commaIndex = finalAnalysis.lastIndexOf(',', targetLength);
      const periodIndex = finalAnalysis.lastIndexOf('.', targetLength);
      const spaceIndex = finalAnalysis.lastIndexOf(' ', targetLength);
      
      // Prefer comma, then period, then space
      if (commaIndex > targetLength * 0.7) { // Only use if it's not too early
        cutPoint = commaIndex;
      } else if (periodIndex > targetLength * 0.7) {
        cutPoint = periodIndex;
      } else if (spaceIndex > targetLength * 0.7) {
        cutPoint = spaceIndex;
      }
      
      finalAnalysis = finalAnalysis.substring(0, cutPoint).trim();
      
      // If still too long, hard truncate (shouldn't happen with better prompt, but safety net)
      if (finalAnalysis.length > 80) {
        finalAnalysis = finalAnalysis.substring(0, 80).trim();
      }
      
      console.warn(`⚠️ Line 17 summary was ${analysis.length} chars, shortened to ${finalAnalysis.length} chars`);
    }
    
    return finalAnalysis.toUpperCase();
  } catch (error: any) {
    console.error('❌ Error calling OpenAI API for Line 17:', error);
    // Fallback to truncation
    return businessPurpose.substring(0, 80).toUpperCase();
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
  // CRITICAL: Ensure we're using a fresh copy of fields, not a reference
  // Log the record structure to detect any issues
  console.log(`🔍 mapAirtableToSS4 called with record:`, {
    recordId: record.id || 'NO ID',
    hasFields: !!record.fields,
    fieldsKeys: record.fields ? Object.keys(record.fields).length : 0,
  });
  
  const fields = record.fields || record;
  
  // CRITICAL: Log what fields we're actually using - especially owner SSNs
  console.log(`🔍 Fields being used in mapAirtableToSS4:`, {
    companyName: fields['Company Name'] || 'MISSING',
    entityType: fields['Entity Type'] || 'MISSING',
    ownerCount: fields['Owner Count'] || 'MISSING',
    owner1Name: fields['Owner 1 Name'] || 'MISSING',
    owner1SSN: fields['Owner 1 SSN'] || 'MISSING',
    owner2Name: fields['Owner 2 Name'] || 'MISSING',
    owner2SSN: fields['Owner 2 SSN'] || 'MISSING',
    owner3Name: fields['Owner 3 Name'] || 'MISSING',
    owner3SSN: fields['Owner 3 SSN'] || 'MISSING',
  });
  
  // Determine entity type first
  const entityType = fields['Entity Type'] || 'LLC';
  const isLLC = entityType === 'LLC';
  const isCorp = entityType === 'C-Corp' || entityType === 'S-Corp';
  
  // Find the responsible party for Line 7a and 7b
  // For C-Corp: Must be an officer
  // For LLC: Can be any owner/manager
  // CRITICAL: Initialize all variables to empty strings to prevent data leakage
  // This ensures that each request starts with a clean slate
  let responsiblePartyName = '';
  let responsiblePartyFirstName = '';
  let responsiblePartyLastName = '';
  let responsiblePartySSN = '';
  let responsiblePartyAddress = '';
  let responsiblePartyOfficerRole = ''; // Officer role for C-Corp (for designee name)
  
  console.log(`🔍 Initialized responsible party variables (all empty) for ${entityType}:`, {
    responsiblePartyName,
    responsiblePartySSN,
    responsiblePartyAddress,
    entityType,
  });
  
  const isSCorp = entityType === 'S-Corp';
  const isCCorp = entityType === 'C-Corp';
  
  if (isCorp) {
    // Get officers count
    const officersCount = fields['Officers Count'] || 0;
    const officersAllOwners = fields['Officers All Owners'] === 'Yes' || fields['Officers All Owners'] === true;
    
    // FINAL LOGIC FOR CORPORATIONS:
    // S-Corp: President always has SSN and always signs
    // C-Corp: President with SSN > Any officer with SSN > Highest % owner (if no SSN)
    
    // Helper function to check if role is PRESIDENT
    const isPresidentRole = (role: string): boolean => {
      if (!role) return false;
      const roleUpper = role.trim().toUpperCase();
      return roleUpper === 'PRESIDENT' || 
             (roleUpper.startsWith('PRESIDENT') && !roleUpper.includes('VICE') && !roleUpper.includes('CO-'));
    };
    
    // Helper function to get valid SSN
    const hasValidSSN = (ssn: string): boolean => {
      if (!ssn || ssn.trim() === '') return false;
      const ssnUpper = ssn.toUpperCase();
      return ssnUpper !== 'N/A' && !ssnUpper.includes('FOREIGN');
    };
    
    // Collect all officers with their SSNs and roles
    interface OfficerInfo {
      officerIndex: number;
      ownerIndex: number;
      name: string;
      firstName: string;
      lastName: string;
      ssn: string;
      address: string;
      role: string;
      ownershipPercent: number;
    }
    const allOfficers: OfficerInfo[] = [];
    
    if (officersAllOwners) {
      // All owners are officers
      const ownerCount = fields['Owner Count'] || 1;
      for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
        const ownerName = fields[`Owner ${i} Name`] || '';
        if (!ownerName || ownerName.trim() === '') continue;
        
        const ownerSSN = fields[`Owner ${i} SSN`] || '';
        // Find officer role
        let officerRole = '';
        for (let k = 1; k <= Math.min(officersCount, 6); k++) {
          const officerName = fields[`Officer ${k} Name`] || '';
          if (officerName && ownerName && 
              officerName.trim().toLowerCase() === ownerName.trim().toLowerCase()) {
            officerRole = fields[`Officer ${k} Role`] || '';
            break;
          }
        }
        
        // Get ownership percentage
        let ownershipPercent = fields[`Owner ${i} Ownership %`] || 0;
        if (ownershipPercent < 1 && ownershipPercent > 0) {
          ownershipPercent = ownershipPercent * 100;
        }
        
        allOfficers.push({
          officerIndex: i,
          ownerIndex: i,
          name: ownerName,
          firstName: fields[`Owner ${i} First Name`] || '',
          lastName: fields[`Owner ${i} Last Name`] || '',
          ssn: ownerSSN,
          address: fields[`Owner ${i} Address`] || '',
          role: officerRole,
          ownershipPercent: ownershipPercent,
        });
      }
    } else {
      // Specific officers, match to owners
      const ownerCount = fields['Owner Count'] || 1;
      for (let i = 1; i <= Math.min(officersCount, 6); i++) {
        const officerName = fields[`Officer ${i} Name`] || '';
        if (!officerName || officerName.trim() === '') continue;
        
        const officerRole = fields[`Officer ${i} Role`] || '';
        
        // Match to owner to get SSN and ownership
        for (let j = 1; j <= Math.min(ownerCount, 6); j++) {
          const ownerName = fields[`Owner ${j} Name`] || '';
          if (ownerName && officerName && 
              ownerName.trim().toLowerCase() === officerName.trim().toLowerCase()) {
            const ownerSSN = fields[`Owner ${j} SSN`] || '';
            
            // Get ownership percentage
            let ownershipPercent = fields[`Owner ${j} Ownership %`] || 0;
            if (ownershipPercent < 1 && ownershipPercent > 0) {
              ownershipPercent = ownershipPercent * 100;
            }
            
            allOfficers.push({
              officerIndex: i,
              ownerIndex: j,
              name: officerName,
              firstName: fields[`Officer ${i} First Name`] || fields[`Owner ${j} First Name`] || '',
              lastName: fields[`Officer ${i} Last Name`] || fields[`Owner ${j} Last Name`] || '',
              ssn: ownerSSN,
              address: fields[`Officer ${i} Address`] || fields[`Owner ${j} Address`] || '',
              role: officerRole,
              ownershipPercent: ownershipPercent,
            });
            break;
          }
        }
      }
    }
    
    // S-Corp: President always has SSN and always signs
    if (isSCorp) {
      console.log(`🔍 S-Corp: SSN is mandatory - finding President with SSN...`);
      const president = allOfficers.find(o => isPresidentRole(o.role) && hasValidSSN(o.ssn));
      
      if (president) {
        responsiblePartyName = president.name;
        responsiblePartyFirstName = president.firstName;
        responsiblePartyLastName = president.lastName;
        responsiblePartySSN = president.ssn;
        responsiblePartyAddress = president.address;
        responsiblePartyOfficerRole = 'PRESIDENT';
        console.log(`✅ S-Corp: Found President with SSN: ${responsiblePartyName}`);
      } else {
        // This should never happen - S-Corp must have President with SSN
        console.error(`❌ CRITICAL ERROR: S-Corp must have President with SSN!`);
        throw new Error(`CRITICAL: S-Corp must have a PRESIDENT officer with SSN.`);
      }
    } 
    // C-Corp: President with SSN > Any officer with SSN > Highest % owner (if no SSN)
    else if (isCCorp) {
      console.log(`🔍 C-Corp: SSN is NOT mandatory - checking priority order...`);
      
      // Priority 1: President with SSN
      const presidentWithSSN = allOfficers.find(o => isPresidentRole(o.role) && hasValidSSN(o.ssn));
      if (presidentWithSSN) {
        responsiblePartyName = presidentWithSSN.name;
        responsiblePartyFirstName = presidentWithSSN.firstName;
        responsiblePartyLastName = presidentWithSSN.lastName;
        responsiblePartySSN = presidentWithSSN.ssn;
        responsiblePartyAddress = presidentWithSSN.address;
        responsiblePartyOfficerRole = 'PRESIDENT';
        console.log(`✅ C-Corp: Priority 1 - President with SSN: ${responsiblePartyName}`);
      } else {
        // Priority 2: Any officer with SSN
        const officersWithSSN = allOfficers.filter(o => hasValidSSN(o.ssn));
        if (officersWithSSN.length > 0) {
          // Use first officer with SSN (or could prefer by role, but requirements say "any officer")
          const officer = officersWithSSN[0];
          responsiblePartyName = officer.name;
          responsiblePartyFirstName = officer.firstName;
          responsiblePartyLastName = officer.lastName;
          responsiblePartySSN = officer.ssn;
          responsiblePartyAddress = officer.address;
          responsiblePartyOfficerRole = officer.role || '';
          console.log(`✅ C-Corp: Priority 2 - Officer with SSN: ${responsiblePartyName} (role: ${officer.role})`);
        } else {
          // Priority 3: Highest % owner (if no SSN)
          const sortedByOwnership = [...allOfficers].sort((a, b) => b.ownershipPercent - a.ownershipPercent);
          if (sortedByOwnership.length > 0) {
            const highestOwner = sortedByOwnership[0];
            responsiblePartyName = highestOwner.name;
            responsiblePartyFirstName = highestOwner.firstName;
            responsiblePartyLastName = highestOwner.lastName;
            responsiblePartySSN = 'N/A-FOREIGN';
            responsiblePartyAddress = highestOwner.address;
            responsiblePartyOfficerRole = highestOwner.role || '';
            console.log(`✅ C-Corp: Priority 3 - Highest % owner (no SSN): ${responsiblePartyName} (${highestOwner.ownershipPercent}%)`);
          } else {
            // Fallback: Use first officer (should never happen)
            if (allOfficers.length > 0) {
              const officer = allOfficers[0];
              responsiblePartyName = officer.name;
              responsiblePartyFirstName = officer.firstName;
              responsiblePartyLastName = officer.lastName;
              responsiblePartySSN = 'N/A-FOREIGN';
              responsiblePartyAddress = officer.address;
              responsiblePartyOfficerRole = officer.role || '';
              console.log(`⚠️ C-Corp: Fallback - Using first officer: ${responsiblePartyName}`);
            }
          }
        }
      }
    }
    
  } else {
    // FINAL LOGIC FOR LLC:
    // SSN is NOT mandatory
    // Priority: Highest % owner with SSN > Any owner with SSN > Highest % owner (if no SSN)
    
    console.log(`🔍 LLC: SSN is NOT mandatory - checking priority order...`);
    
    // Count actual owners
    let actualOwnerCount = 0;
    for (let i = 1; i <= 6; i++) {
      const ownerName = (fields[`Owner ${i} Name`] || '').trim();
      if (ownerName && ownerName !== '') {
        actualOwnerCount++;
      }
    }
    const ownerCount = actualOwnerCount || fields['Owner Count'] || 1;
    
    // Helper function to check if SSN is valid
    const hasValidSSN = (ssn: string): boolean => {
      if (!ssn || ssn.trim() === '') return false;
      const ssnUpper = ssn.toUpperCase();
      return ssnUpper !== 'N/A' && !ssnUpper.includes('FOREIGN');
    };
    
    // Collect all owners with their SSNs and ownership percentages
    interface OwnerInfo {
      ownerIndex: number;
      name: string;
      firstName: string;
      lastName: string;
      ssn: string;
      address: string;
      ownershipPercent: number;
    }
    const allOwners: OwnerInfo[] = [];
    
    for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
      const ownerName = (fields[`Owner ${i} Name`] || '').trim();
      if (!ownerName || ownerName === '') continue;
      
      const ownerSSN = (fields[`Owner ${i} SSN`] || '').trim();
      
      // Get ownership percentage
      let ownershipPercent = fields[`Owner ${i} Ownership %`] || 0;
      if (ownershipPercent < 1 && ownershipPercent > 0) {
        ownershipPercent = ownershipPercent * 100;
      }
      
      allOwners.push({
        ownerIndex: i,
        name: ownerName,
        firstName: fields[`Owner ${i} First Name`] || '',
        lastName: fields[`Owner ${i} Last Name`] || '',
        ssn: ownerSSN,
        address: fields[`Owner ${i} Address`] || '',
        ownershipPercent: ownershipPercent,
      });
    }
    
    // Priority 1: Highest % owner with SSN
    const ownersWithSSN = allOwners.filter(o => hasValidSSN(o.ssn));
    const sortedByOwnership = [...allOwners].sort((a, b) => b.ownershipPercent - a.ownershipPercent);
    const highestPercentOwner = sortedByOwnership[0];
    
    if (highestPercentOwner && hasValidSSN(highestPercentOwner.ssn)) {
      // Highest % owner has SSN - use them
      responsiblePartyName = highestPercentOwner.name;
      responsiblePartyFirstName = highestPercentOwner.firstName;
      responsiblePartyLastName = highestPercentOwner.lastName;
      responsiblePartySSN = highestPercentOwner.ssn;
      responsiblePartyAddress = highestPercentOwner.address;
      console.log(`✅ LLC: Priority 1 - Highest % owner with SSN: ${responsiblePartyName} (${highestPercentOwner.ownershipPercent}%)`);
    } else if (ownersWithSSN.length > 0) {
      // Priority 2: Any owner with SSN (if highest % doesn't have SSN)
      const owner = ownersWithSSN[0]; // Use first owner with SSN
      responsiblePartyName = owner.name;
      responsiblePartyFirstName = owner.firstName;
      responsiblePartyLastName = owner.lastName;
      responsiblePartySSN = owner.ssn;
      responsiblePartyAddress = owner.address;
      console.log(`✅ LLC: Priority 2 - Owner with SSN: ${responsiblePartyName} (highest % owner doesn't have SSN)`);
    } else {
      // Priority 3: Highest % owner (if no SSN)
      if (allOwners.length > 0) {
        const owner = sortedByOwnership[0];
        responsiblePartyName = owner.name;
        responsiblePartyFirstName = owner.firstName;
        responsiblePartyLastName = owner.lastName;
        responsiblePartySSN = 'N/A-FOREIGN';
        responsiblePartyAddress = owner.address;
        console.log(`✅ LLC: Priority 3 - Highest % owner (no SSN): ${responsiblePartyName} (${owner.ownershipPercent}%)`);
      } else {
        // Fallback: Use Owner 1
        responsiblePartyName = fields['Owner 1 Name'] || '';
        responsiblePartyFirstName = fields['Owner 1 First Name'] || '';
        responsiblePartyLastName = fields['Owner 1 Last Name'] || '';
        responsiblePartySSN = 'N/A-FOREIGN';
        responsiblePartyAddress = fields['Owner 1 Address'] || '';
        console.log(`⚠️ LLC: Fallback - Using Owner 1: ${responsiblePartyName}`);
      }
    }
  }
  
  // Parse company address
  const companyAddress = fields['Company Address'] || '';
  const addressParts = parseAddress(companyAddress);

  // County for Line 6: prefer explicit county field from Airtable.
  // We never invent a county; if no county is stored we fall back to
  // the old behavior (city, state) to avoid leaving it totally blank,
  // but the correct setup is to populate the "County" column in Airtable.
  // County from Airtable (if stored). Normalize by removing the word "County"
  // so we end up with "MIAMI-DADE" instead of "Miami-Dade County".
  const rawCountyFromAirtable =
    (fields['County'] ||
      fields['County Name'] ||
      fields['Business County'] ||
      '').toString().trim();
  const countyFromAirtable = rawCountyFromAirtable
    ? rawCountyFromAirtable.replace(/county$/i, '').trim()
    : '';
  
  // Parse responsible party address
  const rpAddressParts = parseAddress(responsiblePartyAddress);
  
  // ownerCount for signature name calculation - count actual owners
  // Use the same calculation as above (for LLCs) to ensure consistency
  let actualOwnerCount = 0;
  for (let i = 1; i <= 6; i++) {
    const ownerName = fields[`Owner ${i} Name`] || '';
    if (ownerName && ownerName.trim() !== '') {
      actualOwnerCount++; // Count actual owners, not just track highest index
    }
  }
  const ownerCount = actualOwnerCount || fields['Owner Count'] || 1;
  console.log(`📊 Final owner count for signature: ${ownerCount} (from actual count: ${actualOwnerCount}, from Airtable field: ${fields['Owner Count'] || 'NOT SET'})`);
  
  // Determine if sole proprietor: 1 owner with 100% ownership
  let isSoleProprietor = false;
  if (ownerCount === 1) {
    const owner1Ownership = fields['Owner 1 Ownership %'] || 0;
    // Airtable stores ownership as percentage (100 = 100%, 1 = 1%)
    // Check if ownership is 100% (could be 100 or 1.0 depending on format)
    isSoleProprietor = (owner1Ownership === 100 || owner1Ownership === 1.0 || owner1Ownership >= 99.99);
    console.log(`📊 Sole proprietor check: ownerCount=${ownerCount}, Owner 1 Ownership %=${owner1Ownership}, isSoleProprietor=${isSoleProprietor}`);
  }

  
  // Log responsible party selection results
  console.log(`📋 Responsible party selection results:`);
  console.log(`   Name: "${responsiblePartyName}"`);
  console.log(`   First Name: "${responsiblePartyFirstName}"`);
  console.log(`   Last Name: "${responsiblePartyLastName}"`);
  console.log(`   SSN: "${responsiblePartySSN}"`);
  console.log(`   Officer Role: "${responsiblePartyOfficerRole}"`);
  console.log(`   Entity Type: "${entityType}"`);
  console.log(`   Is Corp: ${isCorp}`);
  console.log(`   Is LLC: ${isLLC}`);
  
  // Signature Name: Same as Line 7a
  // For C-Corp/S-Corp: Add officer title (e.g., ", PRESIDENT")
  // For LLC ONLY: Add ",SOLE MEMBER" if single member, or ",MEMBER" if multiple members
  // IMPORTANT: Ensure responsiblePartyName is not empty before creating signatureName
  const baseName = responsiblePartyName || `${responsiblePartyFirstName} ${responsiblePartyLastName}`.trim();
  let signatureName = baseName;
  
  if (!baseName) {
    console.error(`❌ ERROR: responsiblePartyName is empty! Cannot create signature name.`);
    console.error(`   responsiblePartyFirstName: "${responsiblePartyFirstName}"`);
    console.error(`   responsiblePartyLastName: "${responsiblePartyLastName}"`);
    console.error(`   This is a critical error - responsible party must be selected!`);
  }
  
  if (isCorp && (entityType === 'C-Corp' || entityType === 'S-Corp')) {
    // For C-Corp and S-Corp, add officer role to signature name
    // Format: "NAME, ROLE" (with space after comma). We NEVER use "SOLE MEMBER" for corporations.
    // CRITICAL: The responsible party MUST be the PRESIDENT for corporations
    if (responsiblePartyOfficerRole && responsiblePartyOfficerRole.trim() !== '') {
      // Ensure role is PRESIDENT (normalize to PRESIDENT if it contains "PRESIDENT")
      const roleUpper = responsiblePartyOfficerRole.trim().toUpperCase();
      // CRITICAL: Only match exact "PRESIDENT", not "VICE-PRESIDENT"
      const isPresident = roleUpper === 'PRESIDENT' || 
                         (roleUpper.startsWith('PRESIDENT') && !roleUpper.includes('VICE') && !roleUpper.includes('CO-'));
      const finalRole = isPresident ? 'PRESIDENT' : roleUpper;
      signatureName = `${baseName}, ${finalRole}`;
      console.log(`✅ Using officer role in signature for ${entityType}: "${finalRole}"`);
    } else {
      // Safety fallback: If no role found, use PRESIDENT (this should not happen after our fix)
      signatureName = `${baseName}, PRESIDENT`;
      console.error(`❌ ERROR: No officer role found for ${baseName} (${entityType}) - using PRESIDENT as fallback`);
    }
  } else if (isSoleProprietor && isLLC) {
    // Sole proprietor (1 owner with 100% ownership) - use ",SOLE MEMBER" for LLCs only
    signatureName = `${baseName},SOLE MEMBER`;
    console.log(`✅ Sole proprietor detected, using ",SOLE MEMBER" in signature`);
  } else if (isLLC) {
    // Multi-member LLC
    signatureName = `${baseName},MEMBER`;
    console.log(`✅ Multi-member LLC, using ",MEMBER" in signature`);
  }
  
  console.log(`📝 Signature name formatted: "${signatureName}" (base: "${baseName}")`);
  
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
    // IMPORTANT: We never fabricate a county from the city here.
    // - If Airtable has a County field, we send "COUNTY, ST"
    // - Otherwise we send an empty string and let the Lambda derive the
    //   county from city/state (city_to_county + Google Maps) or leave it blank.
    countyState: countyFromAirtable
      ? `${countyFromAirtable.toUpperCase()}, ${(addressParts.state || 'FL').toUpperCase()}`
      : '',
    
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
    // Use the actual owner count (counted from Owner ${i} Name fields) for LLCs
    llcMemberCount: (() => {
      const count = isLLC ? ownerCount : undefined;
      if (isLLC) {
        console.log(`📊 Line 8b - Setting LLC Member Count: ${count} (ownerCount: ${ownerCount}, actualOwnerCount: ${actualOwnerCount})`);
      }
      return count;
    })(),
    
    // Line 9a: Type of entity (checkbox)
    entityTypeCode: getEntityTypeCode(entityType),
    
    // Line 9b: State of incorporation (for corps) or Formation State (for LLCs) - ALL CAPS from Formation State column
    // Lambda uses formationState for Line 9b for all entity types
    stateOfIncorporation: isCorp ? ((fields['Formation State'] || 'FL').toUpperCase()) : undefined,
    // Also pass formationState directly (Lambda uses this for Line 9b)
    // formationState is already set above, but ensure it's uppercase for Lambda
    
    // Line 10: Summarized Business Purpose (max 35 characters, ALL CAPS)
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
    // IMPORTANT: If questionnaire left this blank, keep it blank instead of inventing text.
    businessPurpose: fields['Business Purpose'] || '',
    principalActivity: fields['Business Purpose'] || '',
    
    // Line 16: Principal line of merchandise (if applicable)
    principalMerchandise: '',
    
    // Line 17: Has applicant applied for EIN before?
    appliedBefore: 'No',
    
  // Line 18: Third Party Designee (always just ANTONIO REGOJO; officer title belongs in Signature Name)
  designeeName: 'Antonio Regojo',
    designeeAddress: '10634 NE 11 AVE, MIAMI, FL, 33138',
    designeePhone: '(786) 512-0434',  // Updated phone number
    designeeFax: '866-496-4957',
    
    // Signature information
    signatureName: signatureName,
    signatureTitle: isLLC ? 'Member/Manager' : 'President',
    // Responsible party officer role (for C-Corp) - pass to Lambda so it can use actual role
    responsiblePartyOfficerRole: responsiblePartyOfficerRole,
    // Applicant Phone: Use Business Phone from Airtable Formations table
    // CRITICAL: This must be the phone number for THIS specific company, not from a previous company
    applicantPhone: (fields['Business Phone'] || '').trim(),
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
    
    // CRITICAL: Log ALL owner SSN fields to detect data leakage
    console.log(`🔍 ========== DATA LEAKAGE INVESTIGATION ==========`);
    console.log(`📋 Record ID: ${recordId}`);
    console.log(`📋 Record Object ID: ${record.id}`);
    console.log(`✅ Found record: ${fields['Company Name']}`);
    console.log(`📋 Owner Count: ${fields['Owner Count'] || 'MISSING'}`);
    console.log(`🔍 ALL OWNER SSNs FROM AIRTABLE:`);
    for (let i = 1; i <= 6; i++) {
      const ownerName = fields[`Owner ${i} Name`] || '';
      const ownerSSN = fields[`Owner ${i} SSN`] || '';
      if (ownerName || ownerSSN) {
        console.log(`  Owner ${i}: Name="${ownerName}", SSN="${ownerSSN}"`);
      }
    }
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
      owner2Name: fields['Owner 2 Name'] || 'MISSING',
      owner2SSN: fields['Owner 2 SSN'] || 'MISSING',
      owner3Name: fields['Owner 3 Name'] || 'MISSING',
      owner3SSN: fields['Owner 3 SSN'] || 'MISSING',
    });
    console.log(`🔍 ================================================`);
    
    // Step 2: Map Airtable fields to SS-4 format (async - includes OpenAI summarization)
    const ss4Data = await mapAirtableToSS4(record);
    
    // Step 2a: Summarize Business Purpose for Line 10, categorize for Line 16, and analyze for Line 17
    // IMPORTANT: If the questionnaire didn't collect a business purpose, keep this truly empty.
    // Do NOT inject a generic default like "General business operations" here,
    // so that Line 17 can also remain blank when the questionnaire is empty.
    const businessPurpose = fields['Business Purpose'] || '';
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
      applicantPhoneSource: 'Business Phone from Airtable (this company\'s record)',
      signatureName: ss4Data.signatureName,
      responsiblePartyOfficerRole: ss4Data.responsiblePartyOfficerRole, // Pass officer role to Lambda
    });
    
    // Log the officer role being sent to Lambda
    console.log(`🔍 DEBUG: responsiblePartyOfficerRole being sent to Lambda: "${ss4Data.responsiblePartyOfficerRole || 'NOT SET'}"`);
    console.log(`🔍 DEBUG: signatureName being sent to Lambda: "${ss4Data.signatureName || 'NOT SET'}"`);
    
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





