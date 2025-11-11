import Airtable from 'airtable';

// Initialize Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.warn('⚠️ Airtable credentials not configured');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Type definitions for our Airtable record
export interface AirtableFormationRecord {
  // Core Information
  'Company Name': string;
  'Entity Type': 'LLC' | 'C-Corp';
  'Formation State': string;
  'Formation Status': 'Pending' | 'In Progress' | 'Completed' | 'Filed';
  'Customer Email': string;
  'Customer Name': string;
  'Total Payment Amount': number;
  'Products Purchased': string;
  'Payment Date': string;
  'Stripe Payment ID': string;
  
  // Company Details
  'Company Address'?: string;
  'Business Purpose'?: string;
  'Number of Shares'?: number;
  'Vault Path'?: string;
  
  // Phone & Contact
  'Has US Phone'?: 'Yes' | 'No';
  'Business Phone'?: string;
  'Forward Phone'?: string;
  
  // Owners (1-6)
  'Owner Count'?: number;
  'Owner 1 Name'?: string;
  'Owner 1 Ownership %'?: number;
  'Owner 1 Email'?: string;
  'Owner 1 Phone'?: string;
  'Owner 1 Address'?: string;
  'Owner 1 SSN'?: string;
  'Owner 1 ID Document URL'?: string;
  'Owner 2 Name'?: string;
  'Owner 2 Ownership %'?: number;
  'Owner 2 Email'?: string;
  'Owner 2 Phone'?: string;
  'Owner 2 Address'?: string;
  'Owner 2 SSN'?: string;
  'Owner 2 ID Document URL'?: string;
  'Owner 3 Name'?: string;
  'Owner 3 Ownership %'?: number;
  'Owner 3 Email'?: string;
  'Owner 3 Phone'?: string;
  'Owner 3 Address'?: string;
  'Owner 3 SSN'?: string;
  'Owner 3 ID Document URL'?: string;
  'Owner 4 Name'?: string;
  'Owner 4 Ownership %'?: number;
  'Owner 4 Email'?: string;
  'Owner 4 Phone'?: string;
  'Owner 4 Address'?: string;
  'Owner 4 SSN'?: string;
  'Owner 4 ID Document URL'?: string;
  'Owner 5 Name'?: string;
  'Owner 5 Ownership %'?: number;
  'Owner 5 Email'?: string;
  'Owner 5 Phone'?: string;
  'Owner 5 Address'?: string;
  'Owner 5 SSN'?: string;
  'Owner 5 ID Document URL'?: string;
  'Owner 6 Name'?: string;
  'Owner 6 Ownership %'?: number;
  'Owner 6 Email'?: string;
  'Owner 6 Phone'?: string;
  'Owner 6 Address'?: string;
  'Owner 6 SSN'?: string;
  'Owner 6 ID Document URL'?: string;
  
  // Directors (C-Corp)
  'Directors Count'?: number;
  'Director 1 Name'?: string;
  'Director 1 Address'?: string;
  'Director 2 Name'?: string;
  'Director 2 Address'?: string;
  'Director 3 Name'?: string;
  'Director 3 Address'?: string;
  'Director 4 Name'?: string;
  'Director 4 Address'?: string;
  'Director 5 Name'?: string;
  'Director 5 Address'?: string;
  'Director 6 Name'?: string;
  'Director 6 Address'?: string;
  
  // Officers (C-Corp)
  'Officers Count'?: number;
  'Officer 1 Name'?: string;
  'Officer 1 Address'?: string;
  'Officer 1 Role'?: string;
  'Officer 2 Name'?: string;
  'Officer 2 Address'?: string;
  'Officer 2 Role'?: string;
  'Officer 3 Name'?: string;
  'Officer 3 Address'?: string;
  'Officer 3 Role'?: string;
  'Officer 4 Name'?: string;
  'Officer 4 Address'?: string;
  'Officer 4 Role'?: string;
  'Officer 5 Name'?: string;
  'Officer 5 Address'?: string;
  'Officer 5 Role'?: string;
  'Officer 6 Name'?: string;
  'Officer 6 Address'?: string;
  'Officer 6 Role'?: string;
  
  // Managers (LLC)
  'Managers Count'?: number;
  'Manager 1 Name'?: string;
  'Manager 1 Address'?: string;
  'Manager 2 Name'?: string;
  'Manager 2 Address'?: string;
  'Manager 3 Name'?: string;
  'Manager 3 Address'?: string;
  'Manager 4 Name'?: string;
  'Manager 4 Address'?: string;
  'Manager 5 Name'?: string;
  'Manager 5 Address'?: string;
  'Manager 6 Name'?: string;
  'Manager 6 Address'?: string;
  
  // Documents
  'Membership Registry URL'?: string;
  'Organizational Resolution URL'?: string;
  'Operating Agreement URL'?: string;
  
  // Agreement Terms
  'Want Agreement'?: 'Yes' | 'No';
  
  // LLC Agreement Terms
  'LLC Capital Contributions 1'?: string;
  'LLC Capital Contributions 2'?: string;
  'LLC Capital Contributions 3'?: string;
  'LLC Capital Contributions 4'?: string;
  'LLC Capital Contributions 5'?: string;
  'LLC Capital Contributions 6'?: string;
  'LLC Managing Members'?: 'Yes' | 'No';
  'LLC Managing Member 1'?: 'Yes' | 'No';
  'LLC Managing Member 2'?: 'Yes' | 'No';
  'LLC Managing Member 3'?: 'Yes' | 'No';
  'LLC Managing Member 4'?: 'Yes' | 'No';
  'LLC Managing Member 5'?: 'Yes' | 'No';
  'LLC Managing Member 6'?: 'Yes' | 'No';
  'LLC Specific Roles 1'?: string;
  'LLC Specific Roles 2'?: string;
  'LLC Specific Roles 3'?: string;
  'LLC Specific Roles 4'?: string;
  'LLC Specific Roles 5'?: string;
  'LLC Specific Roles 6'?: string;
  'LLC New Members Admission'?: string;
  'LLC New Members Majority %'?: number;
  'LLC Additional Contributions'?: string;
  'LLC Additional Contributions Decision'?: string;
  'LLC Additional Contributions Majority %'?: number;
  'LLC Withdraw Contributions'?: string;
  'LLC Member Loans'?: 'Yes' | 'No';
  'LLC Company Sale Decision'?: string;
  'LLC Company Sale Decision Majority %'?: number;
  'LLC Tax Partner'?: string;
  'LLC Non Compete'?: 'Yes' | 'No';
  'LLC Bank Signers'?: string;
  'LLC Major Decisions'?: string;
  'LLC Minor Decisions'?: string;
  'LLC Manager Restrictions'?: string;
  'LLC Deadlock Resolution'?: string;
  'LLC Key Man Insurance'?: string;
  'LLC Dispute Resolution'?: string;
  'LLC ROFR'?: 'Yes' | 'No';
  'LLC Incapacity Heirs Policy'?: 'Yes' | 'No';
  'LLC New Partners Admission'?: string;
  'LLC New Partners Majority %'?: number;
  'LLC Dissolution Decision'?: string;
  'LLC Dissolution Decision Majority %'?: number;
  'LLC Specific Terms'?: string;
  
  // C-Corp Agreement Terms
  'Corp Capital Per Owner 1'?: string;
  'Corp Capital Per Owner 2'?: string;
  'Corp Capital Per Owner 3'?: string;
  'Corp Capital Per Owner 4'?: string;
  'Corp Capital Per Owner 5'?: string;
  'Corp Capital Per Owner 6'?: string;
  'Corp Specific Responsibilities 1'?: string;
  'Corp Specific Responsibilities 2'?: string;
  'Corp Specific Responsibilities 3'?: string;
  'Corp Specific Responsibilities 4'?: string;
  'Corp Specific Responsibilities 5'?: string;
  'Corp Specific Responsibilities 6'?: string;
  'Corp Hours Commitment'?: string;
  'Corp New Shareholders Admission'?: string;
  'Corp New Shareholders Majority %'?: number;
  'Corp More Capital Process'?: string;
  'Corp More Capital Decision'?: string;
  'Corp More Capital Majority %'?: number;
  'Corp Withdraw Funds Policy'?: string;
  'Corp Sale Decision Threshold'?: string;
  'Corp Sale Decision Majority %'?: number;
  'Corp Bank Signers'?: string;
  'Corp Major Decision Threshold'?: string;
  'Corp Major Decision Majority %'?: number;
  'Corp Shareholder Loans'?: 'Yes' | 'No';
  'Corp Non Compete'?: 'Yes' | 'No';
  'Corp ROFR'?: 'Yes' | 'No';
  'Corp Transfer To Relatives'?: string;
  'Corp Transfer To Relatives Majority %'?: number;
  'Corp Incapacity Heirs Policy'?: 'Yes' | 'No';
  'Corp Divorce Buyout Policy'?: 'Yes' | 'No';
  'Corp Tag Drag Rights'?: 'Yes' | 'No';
  'Corp Additional Clauses'?: string;
  
  // Admin
  'Notes'?: string;
  'Internal Status'?: 'New' | 'Contacted' | 'Documents Sent' | 'Filed' | 'Complete';
}

/**
 * Create a new formation record in Airtable
 */
export async function createFormationRecord(data: AirtableFormationRecord): Promise<string> {
  try {
    console.log('📝 Creating Airtable record for:', data['Company Name']);
    
    const records = await base(AIRTABLE_TABLE_NAME).create([
      {
        fields: data as any,
      },
    ]);
    
    const recordId = records[0].id;
    console.log('✅ Airtable record created:', recordId);
    
    return recordId;
  } catch (error: any) {
    console.error('❌ Failed to create Airtable record:', error.message);
    if (error.statusCode === 404) {
      console.error('💡 Table not found. Please create the "Formations" table in Airtable first.');
    }
    throw error;
  }
}

/**
 * Update an existing formation record in Airtable
 */
export async function updateFormationRecord(
  recordId: string,
  data: Partial<AirtableFormationRecord>
): Promise<void> {
  try {
    console.log('📝 Updating Airtable record:', recordId);
    
    await base(AIRTABLE_TABLE_NAME).update([
      {
        id: recordId,
        fields: data as any,
      },
    ]);
    
    console.log('✅ Airtable record updated:', recordId);
  } catch (error: any) {
    console.error('❌ Failed to update Airtable record:', error.message);
    throw error;
  }
}

/**
 * Find a formation record by Stripe Payment ID
 */
export async function findFormationByStripeId(stripePaymentId: string): Promise<any | null> {
  try {
    const records = await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `{Stripe Payment ID} = '${stripePaymentId}'`,
        maxRecords: 1,
      })
      .firstPage();
    
    return records.length > 0 ? records[0] : null;
  } catch (error: any) {
    console.error('❌ Failed to find Airtable record:', error.message);
    return null;
  }
}

/**
 * Find a formation record by Customer Email
 */
export async function findFormationByEmail(email: string): Promise<any | null> {
  try {
    const records = await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `{Customer Email} = '${email}'`,
        maxRecords: 1,
        sort: [{ field: 'Payment Date', direction: 'desc' }],
      })
      .firstPage();
    
    return records.length > 0 ? records[0] : null;
  } catch (error: any) {
    console.error('❌ Failed to find Airtable record:', error.message);
    return null;
  }
}

/**
 * Map questionnaire data to Airtable format
 */
export function mapQuestionnaireToAirtable(
  formData: any,
  stripeSession: any,
  vaultPath?: string,
  documentUrls?: {
    membershipRegistry?: string;
    organizationalResolution?: string;
    operatingAgreement?: string;
  }
): AirtableFormationRecord {
  const company = formData?.company || {};
  const owners = formData?.owners || [];
  const management = formData?.management || {};
  const agreements = formData?.agreements || {};
  
  const entityType = company.entityType || 'LLC';
  const isLLC = entityType === 'LLC';
  const isCorp = entityType === 'C-Corp';
  
  // Build the record
  const record: AirtableFormationRecord = {
    // Core Information
    'Company Name': company.companyName || 'Unknown Company',
    'Entity Type': entityType,
    // Use state from Stripe metadata first (what was paid for), then fall back to form data
    'Formation State': stripeSession.metadata?.state || company.state || 'Unknown',
    'Formation Status': 'Pending',
    'Customer Email': stripeSession.customer_details?.email || '',
    'Customer Name': stripeSession.customer_details?.name || '',
    'Total Payment Amount': (stripeSession.amount_total || 0) / 100, // Convert cents to dollars
    'Products Purchased': stripeSession.metadata?.selectedServices || '',
    'Payment Date': new Date().toISOString().split('T')[0],
    'Stripe Payment ID': stripeSession.id,
    
    // Company Details
    'Company Address': company.address || '',
    'Business Purpose': company.businessPurpose || '',
    'Number of Shares': isCorp ? (company.numberOfShares || 0) : undefined,
    'Vault Path': vaultPath,
    
    // Phone & Contact
    'Has US Phone': company.hasUsPhone === 'Yes' ? 'Yes' : 'No',
    'Business Phone': company.businessPhone || '',
    'Forward Phone': company.forwardPhoneE164 || '',
    
    // Owners
    'Owner Count': owners.length,
    
    // Documents
    'Membership Registry URL': documentUrls?.membershipRegistry,
    'Organizational Resolution URL': documentUrls?.organizationalResolution,
    'Operating Agreement URL': documentUrls?.operatingAgreement,
    
    // Agreement
    'Want Agreement': agreements.wantAgreement === 'Yes' ? 'Yes' : 'No',
    
    // Admin
    'Internal Status': 'New',
  };
  
  // Map owners (1-6)
  owners.forEach((owner: any, index: number) => {
    const num = index + 1;
    if (num <= 6) {
      (record as any)[`Owner ${num} Name`] = owner.name;
      // Convert ownership from whole number (50) to decimal (0.5) for Airtable percent field
      (record as any)[`Owner ${num} Ownership %`] = owner.ownership ? owner.ownership / 100 : undefined;
      (record as any)[`Owner ${num} Address`] = owner.address;
      (record as any)[`Owner ${num} SSN`] = owner.ssn;
      // ID Document URL will be added later when uploaded
    }
  });
  
  // Map Directors (C-Corp)
  if (isCorp && management.directors) {
    const directors = management.directors || [];
    record['Directors Count'] = directors.length;
    directors.forEach((director: any, index: number) => {
      const num = index + 1;
      if (num <= 6) {
        (record as any)[`Director ${num} Name`] = director.name;
        (record as any)[`Director ${num} Address`] = director.address;
      }
    });
  }
  
  // Map Officers (C-Corp)
  if (isCorp && management.officers) {
    const officers = management.officers || [];
    record['Officers Count'] = officers.length;
    officers.forEach((officer: any, index: number) => {
      const num = index + 1;
      if (num <= 6) {
        (record as any)[`Officer ${num} Name`] = officer.name;
        (record as any)[`Officer ${num} Address`] = officer.address;
        (record as any)[`Officer ${num} Role`] = officer.role;
      }
    });
  }
  
  // Map Managers (LLC)
  if (isLLC && management.managers) {
    const managers = management.managers || [];
    record['Managers Count'] = managers.length;
    managers.forEach((manager: any, index: number) => {
      const num = index + 1;
      if (num <= 6) {
        (record as any)[`Manager ${num} Name`] = manager.name;
        (record as any)[`Manager ${num} Address`] = manager.address;
      }
    });
  }
  
  // Map LLC Agreement Terms
  if (isLLC && agreements.llc) {
    const llc = agreements.llc;
    
    // Capital contributions per owner
    owners.forEach((owner: any, index: number) => {
      const num = index + 1;
      if (num <= 6 && llc.capitalContributions?.[index]) {
        (record as any)[`LLC Capital Contributions ${num}`] = llc.capitalContributions[index];
      }
    });
    
    // Managing members
    record['LLC Managing Members'] = llc.managingMembers === 'Yes' ? 'Yes' : 'No';
    if (llc.managingMembersList) {
      llc.managingMembersList.forEach((isMM: boolean, index: number) => {
        const num = index + 1;
        if (num <= 6) {
          (record as any)[`LLC Managing Member ${num}`] = isMM ? 'Yes' : 'No';
        }
      });
    }
    
    // Specific roles per owner
    owners.forEach((owner: any, index: number) => {
      const num = index + 1;
      if (num <= 6 && llc.specificRoles?.[index]) {
        (record as any)[`LLC Specific Roles ${num}`] = llc.specificRoles[index];
      }
    });
    
    // Decision thresholds (convert percentages to decimals)
    record['LLC New Members Admission'] = llc.newMembersAdmission;
    record['LLC New Members Majority %'] = llc.newMembersMajorityPercent ? llc.newMembersMajorityPercent / 100 : undefined;
    record['LLC Additional Contributions'] = llc.additionalContributions;
    record['LLC Additional Contributions Decision'] = llc.additionalContributionsDecision;
    record['LLC Additional Contributions Majority %'] = llc.additionalContributionsMajorityPercent ? llc.additionalContributionsMajorityPercent / 100 : undefined;
    record['LLC Withdraw Contributions'] = llc.withdrawContributions;
    record['LLC Member Loans'] = llc.memberLoans === 'Yes' ? 'Yes' : 'No';
    record['LLC Company Sale Decision'] = llc.companySaleDecision;
    record['LLC Company Sale Decision Majority %'] = llc.companySaleDecisionMajorityPercent ? llc.companySaleDecisionMajorityPercent / 100 : undefined;
    record['LLC Tax Partner'] = llc.taxPartner;
    record['LLC Non Compete'] = llc.nonCompete === 'Yes' ? 'Yes' : 'No';
    record['LLC Bank Signers'] = llc.bankSigners;
    record['LLC Major Decisions'] = llc.majorDecisions;
    record['LLC Minor Decisions'] = llc.minorDecisions;
    record['LLC Manager Restrictions'] = llc.managerRestrictions;
    record['LLC Deadlock Resolution'] = llc.deadlockResolution;
    record['LLC Key Man Insurance'] = llc.keyManInsurance;
    record['LLC Dispute Resolution'] = llc.disputeResolution;
    record['LLC ROFR'] = llc.rofr === 'Yes' ? 'Yes' : 'No';
    record['LLC Incapacity Heirs Policy'] = llc.incapacityHeirsPolicy === 'Yes' ? 'Yes' : 'No';
    record['LLC New Partners Admission'] = llc.newPartnersAdmission;
    record['LLC New Partners Majority %'] = llc.newPartnersMajorityPercent ? llc.newPartnersMajorityPercent / 100 : undefined;
    record['LLC Dissolution Decision'] = llc.dissolutionDecision;
    record['LLC Dissolution Decision Majority %'] = llc.dissolutionDecisionMajorityPercent ? llc.dissolutionDecisionMajorityPercent / 100 : undefined;
    record['LLC Specific Terms'] = llc.specificTerms;
  }
  
  // Map C-Corp Agreement Terms
  if (isCorp && agreements.corp) {
    const corp = agreements.corp;
    
    // Capital per owner
    owners.forEach((owner: any, index: number) => {
      const num = index + 1;
      if (num <= 6 && corp.capitalPerOwner?.[index]) {
        (record as any)[`Corp Capital Per Owner ${num}`] = corp.capitalPerOwner[index];
      }
    });
    
    // Specific responsibilities per owner
    owners.forEach((owner: any, index: number) => {
      const num = index + 1;
      if (num <= 6 && corp.specificResponsibilities?.[index]) {
        (record as any)[`Corp Specific Responsibilities ${num}`] = corp.specificResponsibilities[index];
      }
    });
    
    // Decision thresholds (convert percentages to decimals)
    record['Corp Hours Commitment'] = corp.hoursCommitment;
    record['Corp New Shareholders Admission'] = corp.newShareholdersAdmission;
    record['Corp New Shareholders Majority %'] = corp.newShareholdersMajorityPercent ? corp.newShareholdersMajorityPercent / 100 : undefined;
    record['Corp More Capital Process'] = corp.moreCapitalProcess;
    record['Corp More Capital Decision'] = corp.moreCapitalDecision;
    record['Corp More Capital Majority %'] = corp.moreCapitalMajorityPercent ? corp.moreCapitalMajorityPercent / 100 : undefined;
    record['Corp Withdraw Funds Policy'] = corp.withdrawFundsPolicy;
    record['Corp Sale Decision Threshold'] = corp.saleDecisionThreshold;
    record['Corp Sale Decision Majority %'] = corp.saleDecisionMajorityPercent ? corp.saleDecisionMajorityPercent / 100 : undefined;
    record['Corp Bank Signers'] = corp.bankSigners;
    record['Corp Major Decision Threshold'] = corp.majorDecisionThreshold;
    record['Corp Major Decision Majority %'] = corp.majorDecisionMajorityPercent ? corp.majorDecisionMajorityPercent / 100 : undefined;
    record['Corp Shareholder Loans'] = corp.shareholderLoans === 'Yes' ? 'Yes' : 'No';
    record['Corp Non Compete'] = corp.nonCompete === 'Yes' ? 'Yes' : 'No';
    record['Corp ROFR'] = corp.rofr === 'Yes' ? 'Yes' : 'No';
    record['Corp Transfer To Relatives'] = corp.transferToRelatives;
    record['Corp Transfer To Relatives Majority %'] = corp.transferToRelativesMajorityPercent ? corp.transferToRelativesMajorityPercent / 100 : undefined;
    record['Corp Incapacity Heirs Policy'] = corp.incapacityHeirsPolicy === 'Yes' ? 'Yes' : 'No';
    record['Corp Divorce Buyout Policy'] = corp.divorceBuyoutPolicy === 'Yes' ? 'Yes' : 'No';
    record['Corp Tag Drag Rights'] = corp.tagDragRights === 'Yes' ? 'Yes' : 'No';
    record['Corp Additional Clauses'] = corp.additionalClauses;
  }
  
  return record;
}

