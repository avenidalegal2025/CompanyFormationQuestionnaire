import Airtable from 'airtable';

// Initialize Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.warn('⚠️ Airtable credentials not configured');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

/**
 * Parse a full name into first and last name components
 * Logic: First word is first name, everything else is last name
 * Examples:
 *   "John Doe" -> { first: "John", last: "Doe" }
 *   "John Michael Doe" -> { first: "John", last: "Michael Doe" }
 *   "Maria" -> { first: "Maria", last: "" }
 */
function parseName(fullName: string | undefined): { first: string; last: string } {
  if (!fullName || typeof fullName !== 'string') {
    return { first: '', last: '' };
  }
  
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { first: parts[0], last: parts.slice(1).join(' ') };
  } else if (parts.length === 1) {
    return { first: parts[0], last: '' };
  }
  return { first: '', last: '' };
}

// Type definitions for our Airtable record
export interface AirtableFormationRecord {
  // Core Information
  'Company Name': string;
  'Entity Type': 'LLC' | 'C-Corp' | 'S-Corp';
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
  'Owner 1 First Name'?: string;
  'Owner 1 Last Name'?: string;
  'Owner 1 Ownership %'?: number;
  'Owner 1 Address'?: string;
  'Owner 1 SSN'?: string;
  'Owner 1 ID Document URL'?: string;
  'Owner 1 Type'?: 'persona' | 'empresa';
  'Owner 1 Company Name'?: string;
  'Owner 1 Company Address'?: string;
  'Owner 1 Nested Owners Count'?: number;
  'Owner 1 Nested Owner 1 Name'?: string;
  'Owner 1 Nested Owner 1 First Name'?: string;
  'Owner 1 Nested Owner 1 Last Name'?: string;
  'Owner 1 Nested Owner 1 Address'?: string;
  'Owner 1 Nested Owner 1 SSN'?: string;
  'Owner 1 Nested Owner 1 ID Document URL'?: string;
  'Owner 1 Nested Owner 2 Name'?: string;
  'Owner 1 Nested Owner 2 First Name'?: string;
  'Owner 1 Nested Owner 2 Last Name'?: string;
  'Owner 1 Nested Owner 2 Address'?: string;
  'Owner 1 Nested Owner 2 SSN'?: string;
  'Owner 1 Nested Owner 2 ID Document URL'?: string;
  'Owner 1 Nested Owner 3 Name'?: string;
  'Owner 1 Nested Owner 3 First Name'?: string;
  'Owner 1 Nested Owner 3 Last Name'?: string;
  'Owner 1 Nested Owner 3 Address'?: string;
  'Owner 1 Nested Owner 3 SSN'?: string;
  'Owner 1 Nested Owner 3 ID Document URL'?: string;
  'Owner 1 Nested Owner 4 Name'?: string;
  'Owner 1 Nested Owner 4 First Name'?: string;
  'Owner 1 Nested Owner 4 Last Name'?: string;
  'Owner 1 Nested Owner 4 Address'?: string;
  'Owner 1 Nested Owner 4 SSN'?: string;
  'Owner 1 Nested Owner 4 ID Document URL'?: string;
  'Owner 1 Nested Owner 5 Name'?: string;
  'Owner 1 Nested Owner 5 First Name'?: string;
  'Owner 1 Nested Owner 5 Last Name'?: string;
  'Owner 1 Nested Owner 5 Address'?: string;
  'Owner 1 Nested Owner 5 SSN'?: string;
  'Owner 1 Nested Owner 5 ID Document URL'?: string;
  'Owner 1 Nested Owner 6 Name'?: string;
  'Owner 1 Nested Owner 6 First Name'?: string;
  'Owner 1 Nested Owner 6 Last Name'?: string;
  'Owner 1 Nested Owner 6 Address'?: string;
  'Owner 1 Nested Owner 6 SSN'?: string;
  'Owner 1 Nested Owner 6 ID Document URL'?: string;
  'Owner 2 Name'?: string;
  'Owner 2 First Name'?: string;
  'Owner 2 Last Name'?: string;
  'Owner 2 Ownership %'?: number;
  'Owner 2 Address'?: string;
  'Owner 2 SSN'?: string;
  'Owner 2 ID Document URL'?: string;
  'Owner 2 Type'?: 'persona' | 'empresa';
  'Owner 2 Company Name'?: string;
  'Owner 2 Company Address'?: string;
  'Owner 2 Nested Owners Count'?: number;
  'Owner 2 Nested Owner 1 Name'?: string;
  'Owner 2 Nested Owner 1 First Name'?: string;
  'Owner 2 Nested Owner 1 Last Name'?: string;
  'Owner 2 Nested Owner 1 Address'?: string;
  'Owner 2 Nested Owner 1 SSN'?: string;
  'Owner 2 Nested Owner 1 ID Document URL'?: string;
  'Owner 2 Nested Owner 2 Name'?: string;
  'Owner 2 Nested Owner 2 First Name'?: string;
  'Owner 2 Nested Owner 2 Last Name'?: string;
  'Owner 2 Nested Owner 2 Address'?: string;
  'Owner 2 Nested Owner 2 SSN'?: string;
  'Owner 2 Nested Owner 2 ID Document URL'?: string;
  'Owner 2 Nested Owner 3 Name'?: string;
  'Owner 2 Nested Owner 3 First Name'?: string;
  'Owner 2 Nested Owner 3 Last Name'?: string;
  'Owner 2 Nested Owner 3 Address'?: string;
  'Owner 2 Nested Owner 3 SSN'?: string;
  'Owner 2 Nested Owner 3 ID Document URL'?: string;
  'Owner 2 Nested Owner 4 Name'?: string;
  'Owner 2 Nested Owner 4 First Name'?: string;
  'Owner 2 Nested Owner 4 Last Name'?: string;
  'Owner 2 Nested Owner 4 Address'?: string;
  'Owner 2 Nested Owner 4 SSN'?: string;
  'Owner 2 Nested Owner 4 ID Document URL'?: string;
  'Owner 2 Nested Owner 5 Name'?: string;
  'Owner 2 Nested Owner 5 First Name'?: string;
  'Owner 2 Nested Owner 5 Last Name'?: string;
  'Owner 2 Nested Owner 5 Address'?: string;
  'Owner 2 Nested Owner 5 SSN'?: string;
  'Owner 2 Nested Owner 5 ID Document URL'?: string;
  'Owner 2 Nested Owner 6 Name'?: string;
  'Owner 2 Nested Owner 6 First Name'?: string;
  'Owner 2 Nested Owner 6 Last Name'?: string;
  'Owner 2 Nested Owner 6 Address'?: string;
  'Owner 2 Nested Owner 6 SSN'?: string;
  'Owner 2 Nested Owner 6 ID Document URL'?: string;
  'Owner 3 Name'?: string;
  'Owner 3 First Name'?: string;
  'Owner 3 Last Name'?: string;
  'Owner 3 Ownership %'?: number;
  'Owner 3 Address'?: string;
  'Owner 3 SSN'?: string;
  'Owner 3 ID Document URL'?: string;
  'Owner 3 Type'?: 'persona' | 'empresa';
  'Owner 3 Company Name'?: string;
  'Owner 3 Company Address'?: string;
  'Owner 3 Nested Owners Count'?: number;
  'Owner 3 Nested Owner 1 Name'?: string;
  'Owner 3 Nested Owner 1 First Name'?: string;
  'Owner 3 Nested Owner 1 Last Name'?: string;
  'Owner 3 Nested Owner 1 Address'?: string;
  'Owner 3 Nested Owner 1 SSN'?: string;
  'Owner 3 Nested Owner 1 ID Document URL'?: string;
  'Owner 3 Nested Owner 2 Name'?: string;
  'Owner 3 Nested Owner 2 First Name'?: string;
  'Owner 3 Nested Owner 2 Last Name'?: string;
  'Owner 3 Nested Owner 2 Address'?: string;
  'Owner 3 Nested Owner 2 SSN'?: string;
  'Owner 3 Nested Owner 2 ID Document URL'?: string;
  'Owner 3 Nested Owner 3 Name'?: string;
  'Owner 3 Nested Owner 3 First Name'?: string;
  'Owner 3 Nested Owner 3 Last Name'?: string;
  'Owner 3 Nested Owner 3 Address'?: string;
  'Owner 3 Nested Owner 3 SSN'?: string;
  'Owner 3 Nested Owner 3 ID Document URL'?: string;
  'Owner 3 Nested Owner 4 Name'?: string;
  'Owner 3 Nested Owner 4 First Name'?: string;
  'Owner 3 Nested Owner 4 Last Name'?: string;
  'Owner 3 Nested Owner 4 Address'?: string;
  'Owner 3 Nested Owner 4 SSN'?: string;
  'Owner 3 Nested Owner 4 ID Document URL'?: string;
  'Owner 3 Nested Owner 5 Name'?: string;
  'Owner 3 Nested Owner 5 First Name'?: string;
  'Owner 3 Nested Owner 5 Last Name'?: string;
  'Owner 3 Nested Owner 5 Address'?: string;
  'Owner 3 Nested Owner 5 SSN'?: string;
  'Owner 3 Nested Owner 5 ID Document URL'?: string;
  'Owner 3 Nested Owner 6 Name'?: string;
  'Owner 3 Nested Owner 6 First Name'?: string;
  'Owner 3 Nested Owner 6 Last Name'?: string;
  'Owner 3 Nested Owner 6 Address'?: string;
  'Owner 3 Nested Owner 6 SSN'?: string;
  'Owner 3 Nested Owner 6 ID Document URL'?: string;
  'Owner 4 Name'?: string;
  'Owner 4 First Name'?: string;
  'Owner 4 Last Name'?: string;
  'Owner 4 Ownership %'?: number;
  'Owner 4 Address'?: string;
  'Owner 4 SSN'?: string;
  'Owner 4 ID Document URL'?: string;
  'Owner 4 Type'?: 'persona' | 'empresa';
  'Owner 4 Company Name'?: string;
  'Owner 4 Company Address'?: string;
  'Owner 4 Nested Owners Count'?: number;
  'Owner 4 Nested Owner 1 Name'?: string;
  'Owner 4 Nested Owner 1 First Name'?: string;
  'Owner 4 Nested Owner 1 Last Name'?: string;
  'Owner 4 Nested Owner 1 Address'?: string;
  'Owner 4 Nested Owner 1 SSN'?: string;
  'Owner 4 Nested Owner 1 ID Document URL'?: string;
  'Owner 4 Nested Owner 2 Name'?: string;
  'Owner 4 Nested Owner 2 First Name'?: string;
  'Owner 4 Nested Owner 2 Last Name'?: string;
  'Owner 4 Nested Owner 2 Address'?: string;
  'Owner 4 Nested Owner 2 SSN'?: string;
  'Owner 4 Nested Owner 2 ID Document URL'?: string;
  'Owner 4 Nested Owner 3 Name'?: string;
  'Owner 4 Nested Owner 3 First Name'?: string;
  'Owner 4 Nested Owner 3 Last Name'?: string;
  'Owner 4 Nested Owner 3 Address'?: string;
  'Owner 4 Nested Owner 3 SSN'?: string;
  'Owner 4 Nested Owner 3 ID Document URL'?: string;
  'Owner 4 Nested Owner 4 Name'?: string;
  'Owner 4 Nested Owner 4 First Name'?: string;
  'Owner 4 Nested Owner 4 Last Name'?: string;
  'Owner 4 Nested Owner 4 Address'?: string;
  'Owner 4 Nested Owner 4 SSN'?: string;
  'Owner 4 Nested Owner 4 ID Document URL'?: string;
  'Owner 4 Nested Owner 5 Name'?: string;
  'Owner 4 Nested Owner 5 First Name'?: string;
  'Owner 4 Nested Owner 5 Last Name'?: string;
  'Owner 4 Nested Owner 5 Address'?: string;
  'Owner 4 Nested Owner 5 SSN'?: string;
  'Owner 4 Nested Owner 5 ID Document URL'?: string;
  'Owner 4 Nested Owner 6 Name'?: string;
  'Owner 4 Nested Owner 6 First Name'?: string;
  'Owner 4 Nested Owner 6 Last Name'?: string;
  'Owner 4 Nested Owner 6 Address'?: string;
  'Owner 4 Nested Owner 6 SSN'?: string;
  'Owner 4 Nested Owner 6 ID Document URL'?: string;
  'Owner 5 Name'?: string;
  'Owner 5 First Name'?: string;
  'Owner 5 Last Name'?: string;
  'Owner 5 Ownership %'?: number;
  'Owner 5 Address'?: string;
  'Owner 5 SSN'?: string;
  'Owner 5 ID Document URL'?: string;
  'Owner 5 Type'?: 'persona' | 'empresa';
  'Owner 5 Company Name'?: string;
  'Owner 5 Company Address'?: string;
  'Owner 5 Nested Owners Count'?: number;
  'Owner 5 Nested Owner 1 Name'?: string;
  'Owner 5 Nested Owner 1 First Name'?: string;
  'Owner 5 Nested Owner 1 Last Name'?: string;
  'Owner 5 Nested Owner 1 Address'?: string;
  'Owner 5 Nested Owner 1 SSN'?: string;
  'Owner 5 Nested Owner 1 ID Document URL'?: string;
  'Owner 5 Nested Owner 2 Name'?: string;
  'Owner 5 Nested Owner 2 First Name'?: string;
  'Owner 5 Nested Owner 2 Last Name'?: string;
  'Owner 5 Nested Owner 2 Address'?: string;
  'Owner 5 Nested Owner 2 SSN'?: string;
  'Owner 5 Nested Owner 2 ID Document URL'?: string;
  'Owner 5 Nested Owner 3 Name'?: string;
  'Owner 5 Nested Owner 3 First Name'?: string;
  'Owner 5 Nested Owner 3 Last Name'?: string;
  'Owner 5 Nested Owner 3 Address'?: string;
  'Owner 5 Nested Owner 3 SSN'?: string;
  'Owner 5 Nested Owner 3 ID Document URL'?: string;
  'Owner 5 Nested Owner 4 Name'?: string;
  'Owner 5 Nested Owner 4 First Name'?: string;
  'Owner 5 Nested Owner 4 Last Name'?: string;
  'Owner 5 Nested Owner 4 Address'?: string;
  'Owner 5 Nested Owner 4 SSN'?: string;
  'Owner 5 Nested Owner 4 ID Document URL'?: string;
  'Owner 5 Nested Owner 5 Name'?: string;
  'Owner 5 Nested Owner 5 First Name'?: string;
  'Owner 5 Nested Owner 5 Last Name'?: string;
  'Owner 5 Nested Owner 5 Address'?: string;
  'Owner 5 Nested Owner 5 SSN'?: string;
  'Owner 5 Nested Owner 5 ID Document URL'?: string;
  'Owner 5 Nested Owner 6 Name'?: string;
  'Owner 5 Nested Owner 6 First Name'?: string;
  'Owner 5 Nested Owner 6 Last Name'?: string;
  'Owner 5 Nested Owner 6 Address'?: string;
  'Owner 5 Nested Owner 6 SSN'?: string;
  'Owner 5 Nested Owner 6 ID Document URL'?: string;
  'Owner 6 Name'?: string;
  'Owner 6 First Name'?: string;
  'Owner 6 Last Name'?: string;
  'Owner 6 Ownership %'?: number;
  'Owner 6 Address'?: string;
  'Owner 6 SSN'?: string;
  'Owner 6 ID Document URL'?: string;
  'Owner 6 Type'?: 'persona' | 'empresa';
  'Owner 6 Company Name'?: string;
  'Owner 6 Company Address'?: string;
  'Owner 6 Nested Owners Count'?: number;
  'Owner 6 Nested Owner 1 Name'?: string;
  'Owner 6 Nested Owner 1 First Name'?: string;
  'Owner 6 Nested Owner 1 Last Name'?: string;
  'Owner 6 Nested Owner 1 Address'?: string;
  'Owner 6 Nested Owner 1 SSN'?: string;
  'Owner 6 Nested Owner 1 ID Document URL'?: string;
  'Owner 6 Nested Owner 2 Name'?: string;
  'Owner 6 Nested Owner 2 First Name'?: string;
  'Owner 6 Nested Owner 2 Last Name'?: string;
  'Owner 6 Nested Owner 2 Address'?: string;
  'Owner 6 Nested Owner 2 SSN'?: string;
  'Owner 6 Nested Owner 2 ID Document URL'?: string;
  'Owner 6 Nested Owner 3 Name'?: string;
  'Owner 6 Nested Owner 3 First Name'?: string;
  'Owner 6 Nested Owner 3 Last Name'?: string;
  'Owner 6 Nested Owner 3 Address'?: string;
  'Owner 6 Nested Owner 3 SSN'?: string;
  'Owner 6 Nested Owner 3 ID Document URL'?: string;
  'Owner 6 Nested Owner 4 Name'?: string;
  'Owner 6 Nested Owner 4 First Name'?: string;
  'Owner 6 Nested Owner 4 Last Name'?: string;
  'Owner 6 Nested Owner 4 Address'?: string;
  'Owner 6 Nested Owner 4 SSN'?: string;
  'Owner 6 Nested Owner 4 ID Document URL'?: string;
  'Owner 6 Nested Owner 5 Name'?: string;
  'Owner 6 Nested Owner 5 First Name'?: string;
  'Owner 6 Nested Owner 5 Last Name'?: string;
  'Owner 6 Nested Owner 5 Address'?: string;
  'Owner 6 Nested Owner 5 SSN'?: string;
  'Owner 6 Nested Owner 5 ID Document URL'?: string;
  'Owner 6 Nested Owner 6 Name'?: string;
  'Owner 6 Nested Owner 6 First Name'?: string;
  'Owner 6 Nested Owner 6 Last Name'?: string;
  'Owner 6 Nested Owner 6 Address'?: string;
  'Owner 6 Nested Owner 6 SSN'?: string;
  'Owner 6 Nested Owner 6 ID Document URL'?: string;
  
  // Directors (C-Corp)
  'Directors Count'?: number;
  'Director 1 Name'?: string;
  'Director 1 First Name'?: string;
  'Director 1 Last Name'?: string;
  'Director 1 Address'?: string;
  'Director 2 Name'?: string;
  'Director 2 First Name'?: string;
  'Director 2 Last Name'?: string;
  'Director 2 Address'?: string;
  'Director 3 Name'?: string;
  'Director 3 First Name'?: string;
  'Director 3 Last Name'?: string;
  'Director 3 Address'?: string;
  'Director 4 Name'?: string;
  'Director 4 First Name'?: string;
  'Director 4 Last Name'?: string;
  'Director 4 Address'?: string;
  'Director 5 Name'?: string;
  'Director 5 First Name'?: string;
  'Director 5 Last Name'?: string;
  'Director 5 Address'?: string;
  'Director 6 Name'?: string;
  'Director 6 First Name'?: string;
  'Director 6 Last Name'?: string;
  'Director 6 Address'?: string;
  
  // Officers (C-Corp)
  'Officers Count'?: number;
  'Officers All Owners'?: string;
  'Officer 1 Name'?: string;
  'Officer 1 First Name'?: string;
  'Officer 1 Last Name'?: string;
  'Officer 1 Address'?: string;
  'Officer 1 Role'?: string;
  'Officer 1 SSN'?: string;
  'Officer 2 Name'?: string;
  'Officer 2 First Name'?: string;
  'Officer 2 Last Name'?: string;
  'Officer 2 Address'?: string;
  'Officer 2 Role'?: string;
  'Officer 2 SSN'?: string;
  'Officer 3 Name'?: string;
  'Officer 3 First Name'?: string;
  'Officer 3 Last Name'?: string;
  'Officer 3 Address'?: string;
  'Officer 3 Role'?: string;
  'Officer 3 SSN'?: string;
  'Officer 4 Name'?: string;
  'Officer 4 First Name'?: string;
  'Officer 4 Last Name'?: string;
  'Officer 4 Address'?: string;
  'Officer 4 Role'?: string;
  'Officer 4 SSN'?: string;
  'Officer 5 Name'?: string;
  'Officer 5 First Name'?: string;
  'Officer 5 Last Name'?: string;
  'Officer 5 Address'?: string;
  'Officer 5 Role'?: string;
  'Officer 5 SSN'?: string;
  'Officer 6 Name'?: string;
  'Officer 6 First Name'?: string;
  'Officer 6 Last Name'?: string;
  'Officer 6 Address'?: string;
  'Officer 6 Role'?: string;
  'Officer 6 SSN'?: string;
  
  // Managers (LLC)
  'Managers Count'?: number;
  'Manager 1 Name'?: string;
  'Manager 1 First Name'?: string;
  'Manager 1 Last Name'?: string;
  'Manager 1 Address'?: string;
  'Manager 2 Name'?: string;
  'Manager 2 First Name'?: string;
  'Manager 2 Last Name'?: string;
  'Manager 2 Address'?: string;
  'Manager 3 Name'?: string;
  'Manager 3 First Name'?: string;
  'Manager 3 Last Name'?: string;
  'Manager 3 Address'?: string;
  'Manager 4 Name'?: string;
  'Manager 4 First Name'?: string;
  'Manager 4 Last Name'?: string;
  'Manager 4 Address'?: string;
  'Manager 5 Name'?: string;
  'Manager 5 First Name'?: string;
  'Manager 5 Last Name'?: string;
  'Manager 5 Address'?: string;
  'Manager 6 Name'?: string;
  'Manager 6 First Name'?: string;
  'Manager 6 Last Name'?: string;
  'Manager 6 Address'?: string;
  
  // Documents
  'Membership Registry URL'?: string;
  'Organizational Resolution URL'?: string;
  'Operating Agreement URL'?: string;
  'SS-4 URL'?: string;
  '2848 URL'?: string;
  '8821 URL'?: string;
  
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
  'LLC Major Decisions %'?: number;
  'LLC Minor Decisions'?: string;
  'LLC Minor Decisions %'?: number;
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
  'Corp Tax Owner'?: string;
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
  'Autofill'?: 'Yes' | 'No';
  'Filing Images'?: string;
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
 * 
 * DATA SOURCE PRIORITY:
 * 1. formData (from DynamoDB) - PRIMARY source of truth for all questionnaire data
 * 2. stripeSession - Used only for payment metadata (amount, payment ID, customer details)
 * 3. Function parameters - Used for vault path and document URLs
 * 
 * This ensures consistency and avoids Stripe metadata size limits (500 chars per key)
 */
export function mapQuestionnaireToAirtable(
  formData: any,
  stripeSession: any,
  vaultPath?: string,
  documentUrls?: {
    membershipRegistry?: string;
    organizationalResolution?: string;
    operatingAgreement?: string;
    ss4?: string;
    form2848?: string;
    form8821?: string;
  }
): AirtableFormationRecord {
  // Handle case where formData is null/undefined - use Stripe session metadata as fallback
  if (!formData) {
    console.warn('⚠️ formData is null/undefined, using Stripe session metadata as fallback');
  }
  
  const company = formData?.company || {};
  const owners = formData?.owners || [];
  const admin = formData?.admin || {}; // Admin contains wantAgreement, managersCount, and dynamic manager/director/officer fields
  const agreement = formData?.agreement || {}; // Agreement contains LLC/Corp agreement terms
  
  const entityType = company.entityType || 'LLC';
  const isLLC = entityType === 'LLC';
  const isCorp = entityType === 'C-Corp' || entityType === 'S-Corp';
  
  // Debug: Log address-related fields
  console.log('🏠 Address debug:', {
    hasUsaAddress: company.hasUsaAddress,
    hasUsAddress: company.hasUsAddress,
    stripeHasUsAddress: stripeSession.metadata?.hasUsAddress,
    address: company.address,
    addressLine1: company.addressLine1,
    fullAddress: company.fullAddress,
  });
  
  // Build the record
  const record: AirtableFormationRecord = {
    // Core Information - prioritize formData (DynamoDB) over Stripe metadata for consistency
    'Company Name': company.companyName || stripeSession.metadata?.companyName || 'Unknown Company',
    'Entity Type': entityType,
    // Use formData state first (source of truth), then Stripe metadata as fallback
    'Formation State': company.formationState || company.state || stripeSession.metadata?.state || 'Unknown',
    'Formation Status': 'Pending',
    'Customer Email': (stripeSession.customer_details?.email || '').toLowerCase().trim(),
    'Customer Name': stripeSession.customer_details?.name || formData.profile?.fullName || '',
    'Total Payment Amount': (stripeSession.amount_total || 0) / 100, // Convert cents to dollars
    'Products Purchased': stripeSession.metadata?.selectedServices || '',
    'Payment Date': new Date().toISOString().split('T')[0],
    'Stripe Payment ID': stripeSession.id,
    
    // Company Details
    // If user doesn't have US address, assign Avenida Legal's address
    // Check both hasUsaAddress and hasUsAddress for backward compatibility
    // Build full address including street, city, state, and zip
    'Company Address': (company.hasUsaAddress === 'No' || company.hasUsAddress === 'No' || 
                        company.hasUsaAddress === false || company.hasUsAddress === false ||
                        stripeSession.metadata?.hasUsAddress === 'false')
      ? '12550 Biscayne Blvd Ste 110, North Miami, FL 33181'
      : (() => {
          // Build full address from components
          const street = company.addressLine1 || company.address || company.fullAddress || '';
          const city = company.city || '';
          const state = company.state || '';
          const zip = company.postalCode || company.zipCode || '';
          
          // If we have a full address already, use it
          if (company.fullAddress || company.address) {
            return company.fullAddress || company.address || '';
          }
          
          // Otherwise, build from components
          const parts = [street];
          if (city || state || zip) {
            const cityStateZip = [city, state, zip].filter(Boolean).join(' ');
            if (cityStateZip) {
              parts.push(cityStateZip);
            }
          }
          
          return parts.filter(Boolean).join(', ') || '';
        })(),
    'Business Purpose': company.businessPurpose || '',
    'Number of Shares': (isCorp || entityType === 'S-Corp') ? (company.numberOfShares || 0) : undefined,
    'Vault Path': vaultPath,
    
    // Phone & Contact
    'Has US Phone': company.hasUsPhone === 'Yes' ? 'Yes' : 'No',
    'Business Phone': company.usPhoneNumber || '', // Phone number user already has (when hasUsPhone === 'Yes')
    'Forward Phone': company.forwardPhoneE164 || '', // Forwarding number for provisioned phone (when hasUsPhone === 'No')
    
    // Owners
    'Owner Count': owners.length,
    
    // Documents - Use secure authenticated endpoint
    // Format: https://yourapp.com/api/documents/view?key={s3Key}
    // Only authorized lawyers can access these links
    // Prefer signed versions when available
    'Membership Registry URL': documentUrls?.membershipRegistry 
      ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app'}/api/documents/view?key=${encodeURIComponent(documentUrls.membershipRegistry)}`
      : '',
    'Organizational Resolution URL': documentUrls?.organizationalResolution
      ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app'}/api/documents/view?key=${encodeURIComponent(documentUrls.organizationalResolution)}`
      : '',
    'Operating Agreement URL': documentUrls?.operatingAgreement
      ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app'}/api/documents/view?key=${encodeURIComponent(documentUrls.operatingAgreement)}`
      : '',
    'SS-4 URL': documentUrls?.ss4
      ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app'}/api/documents/view?key=${encodeURIComponent(documentUrls.ss4)}`
      : '',
    '2848 URL': documentUrls?.form2848
      ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app'}/api/documents/view?key=${encodeURIComponent(documentUrls.form2848)}`
      : '',
    '8821 URL': documentUrls?.form8821
      ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app'}/api/documents/view?key=${encodeURIComponent(documentUrls.form8821)}`
      : '',
    
    // Agreement
    'Want Agreement': admin.wantAgreement === 'Yes' ? 'Yes' : 'No',
    
    // Admin
    'Internal Status': 'New',
    
    // Autofill starts as No - user manually sets to Yes after review
    'Autofill': 'No',
    
    // Filing Images - Link to screenshot viewer (authenticated, presigned URLs)
    'Filing Images': (() => {
      const companyName = company.companyName || stripeSession.metadata?.companyName || 'Unknown Company';
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
      return `${baseUrl}/admin/screenshots?company=${encodeURIComponent(companyName)}`;
    })(),
  };
  
  // Map owners (1-6)
  owners.forEach((owner: any, index: number) => {
    const num = index + 1;
    if (num <= 6) {
      const ownerType = owner.ownerType || 'persona';
      (record as any)[`Owner ${num} Type`] = ownerType;
      
      // Convert ownership from whole number (50) to decimal (0.5) for Airtable percent field
      (record as any)[`Owner ${num} Ownership %`] = owner.ownership ? Number(owner.ownership) / 100 : undefined;
      
      if (ownerType === 'persona') {
        // Persona fields - use separate firstName/lastName if available, otherwise parse fullName
        const firstName = owner.firstName || '';
        const lastName = owner.lastName || '';
        const fullName = owner.fullName || `${firstName} ${lastName}`.trim();
        
        // If separate fields aren't filled, fall back to parsing fullName
        let finalFirstName = firstName;
        let finalLastName = lastName;
        if (!firstName && !lastName && fullName) {
          const parsed = parseName(fullName);
          finalFirstName = parsed.first;
          finalLastName = parsed.last;
        }
        
        (record as any)[`Owner ${num} Name`] = fullName || `${finalFirstName} ${finalLastName}`.trim();
        (record as any)[`Owner ${num} First Name`] = finalFirstName;
        (record as any)[`Owner ${num} Last Name`] = finalLastName;
        (record as any)[`Owner ${num} Address`] = owner.address;
        (record as any)[`Owner ${num} SSN`] = owner.tin; // TIN = Tax Identification Number (SSN/EIN)
        
        // Store S3 key for passport document
        if (owner.passportS3Key) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
          const viewUrl = `${baseUrl}/api/admin/passport/view?key=${encodeURIComponent(owner.passportS3Key)}`;
          (record as any)[`Owner ${num} ID Document URL`] = viewUrl;
        }
      } else if (ownerType === 'empresa') {
        // Empresa fields
        (record as any)[`Owner ${num} Company Name`] = owner.companyName;
        (record as any)[`Owner ${num} Company Address`] = owner.companyAddress;
        (record as any)[`Owner ${num} Nested Owners Count`] = owner.nestedOwnersCount || 0;
        
        // Map nested owners (1-6)
        const nestedOwners = owner.nestedOwners || [];
        nestedOwners.forEach((nestedOwner: any, nestedIndex: number) => {
          const nestedNum = nestedIndex + 1;
          if (nestedNum <= 6) {
            // Use separate firstName/lastName if available, otherwise parse fullName
            const nestedFirstName = nestedOwner.firstName || '';
            const nestedLastName = nestedOwner.lastName || '';
            const nestedFullName = nestedOwner.fullName || `${nestedFirstName} ${nestedLastName}`.trim();
            
            let finalNestedFirstName = nestedFirstName;
            let finalNestedLastName = nestedLastName;
            if (!nestedFirstName && !nestedLastName && nestedFullName) {
              const parsed = parseName(nestedFullName);
              finalNestedFirstName = parsed.first;
              finalNestedLastName = parsed.last;
            }
            
            (record as any)[`Owner ${num} Nested Owner ${nestedNum} Name`] = nestedFullName || `${finalNestedFirstName} ${finalNestedLastName}`.trim();
            (record as any)[`Owner ${num} Nested Owner ${nestedNum} First Name`] = finalNestedFirstName;
            (record as any)[`Owner ${num} Nested Owner ${nestedNum} Last Name`] = finalNestedLastName;
            (record as any)[`Owner ${num} Nested Owner ${nestedNum} Address`] = nestedOwner.address;
            (record as any)[`Owner ${num} Nested Owner ${nestedNum} SSN`] = nestedOwner.tin;
            
            // Store S3 key for nested owner passport document
            if (nestedOwner.passportS3Key) {
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
              const viewUrl = `${baseUrl}/api/admin/passport/view?key=${encodeURIComponent(nestedOwner.passportS3Key)}`;
              (record as any)[`Owner ${num} Nested Owner ${nestedNum} ID Document URL`] = viewUrl;
            }
          }
        });
      }
    }
  });
  
  // Clear fields for owners that no longer exist (beyond the current owner count)
  // This ensures that when the number of owners is reduced, old owner data is removed
  // Airtable requires null (not undefined) to clear fields
  const currentOwnerCount = owners.length;
  for (let num = currentOwnerCount + 1; num <= 6; num++) {
    // Clear all owner fields for owners beyond the current count
    (record as any)[`Owner ${num} Type`] = null;
    (record as any)[`Owner ${num} Ownership %`] = null;
    (record as any)[`Owner ${num} Name`] = null;
    (record as any)[`Owner ${num} First Name`] = null;
    (record as any)[`Owner ${num} Last Name`] = null;
    (record as any)[`Owner ${num} Address`] = null;
    (record as any)[`Owner ${num} SSN`] = null;
    (record as any)[`Owner ${num} ID Document URL`] = null;
    (record as any)[`Owner ${num} Company Name`] = null;
    (record as any)[`Owner ${num} Company Address`] = null;
    (record as any)[`Owner ${num} Nested Owners Count`] = null;
    
    // Clear nested owner fields (1-6)
    for (let nestedNum = 1; nestedNum <= 6; nestedNum++) {
      (record as any)[`Owner ${num} Nested Owner ${nestedNum} Name`] = null;
      (record as any)[`Owner ${num} Nested Owner ${nestedNum} First Name`] = null;
      (record as any)[`Owner ${num} Nested Owner ${nestedNum} Last Name`] = null;
      (record as any)[`Owner ${num} Nested Owner ${nestedNum} Address`] = null;
      (record as any)[`Owner ${num} Nested Owner ${nestedNum} SSN`] = null;
      (record as any)[`Owner ${num} Nested Owner ${nestedNum} ID Document URL`] = null;
    }
  }
  
  // Map Directors (C-Corp)
  if (isCorp) {
    const directorsCount = admin.directorsCount || 0;
    record['Directors Count'] = directorsCount;
    
    // Directors are stored as dynamic keys: director1FirstName, director1LastName, director1Address, etc.
    for (let i = 1; i <= Math.min(directorsCount, 6); i++) {
      const directorFirstName = admin[`director${i}FirstName`] || '';
      const directorLastName = admin[`director${i}LastName`] || '';
      const directorName = admin[`director${i}Name`] || `${directorFirstName} ${directorLastName}`.trim();
      
      let finalFirstName = directorFirstName;
      let finalLastName = directorLastName;
      if (!directorFirstName && !directorLastName && directorName) {
        const parsed = parseName(directorName);
        finalFirstName = parsed.first;
        finalLastName = parsed.last;
      }
      
      (record as any)[`Director ${i} Name`] = directorName || `${finalFirstName} ${finalLastName}`.trim();
      (record as any)[`Director ${i} First Name`] = finalFirstName;
      (record as any)[`Director ${i} Last Name`] = finalLastName;
      (record as any)[`Director ${i} Address`] = admin[`director${i}Address`];
    }
  }
  
  // Map Officers (C-Corp)
  if (isCorp) {
    const officersCount = admin.officersCount || 0;
    const officersAllOwners = admin.officersAllOwners === 'Yes' || admin.officersAllOwners === true;
    record['Officers Count'] = officersCount;
    record['Officers All Owners'] = officersAllOwners ? 'Yes' : 'No';
    
    // Officers are stored as dynamic keys: officer1FirstName, officer1LastName, officer1Address, officer1Role, etc.
    // OR if officersAllOwners === "Yes", use shareholderOfficer${i}Role and owner names
    for (let i = 1; i <= Math.min(officersCount, 6); i++) {
      let officerFirstName = '';
      let officerLastName = '';
      let officerName = '';
      let officerAddress = '';
      let officerRole = '';
      
      if (officersAllOwners) {
        // All owners are officers - get name and role from owners/shareholders
        // owners is an array, so access by index (i-1 because array is 0-indexed)
        const ownerIndex = i - 1;
        const owner = owners[ownerIndex] || {};
        const ownerFirstName = owner.firstName || '';
        const ownerLastName = owner.lastName || '';
        const ownerFullName = owner.fullName || `${ownerFirstName} ${ownerLastName}`.trim();
        officerName = ownerFullName || `${ownerFirstName} ${ownerLastName}`.trim();
        officerFirstName = ownerFirstName;
        officerLastName = ownerLastName;
        officerAddress = owner.address || '';
        // Get role from shareholderOfficer${i}Role (used when all owners are officers)
        officerRole = admin[`shareholderOfficer${i}Role`] || '';
        console.log(`📋 Officer ${i} (from Owner ${i}): Name="${officerName}", Role="${officerRole}" (from shareholderOfficer${i}Role)`);
      } else {
        // Specific officers - get from officer fields
        officerFirstName = admin[`officer${i}FirstName`] || '';
        officerLastName = admin[`officer${i}LastName`] || '';
        officerName = admin[`officer${i}Name`] || `${officerFirstName} ${officerLastName}`.trim();
        officerAddress = admin[`officer${i}Address`] || '';
        officerRole = admin[`officer${i}Role`] || '';
      }
      
      // Parse name if needed
      let finalFirstName = officerFirstName;
      let finalLastName = officerLastName;
      if (!officerFirstName && !officerLastName && officerName) {
        const parsed = parseName(officerName);
        finalFirstName = parsed.first;
        finalLastName = parsed.last;
      }
      
      (record as any)[`Officer ${i} Name`] = officerName || `${finalFirstName} ${finalLastName}`.trim();
      (record as any)[`Officer ${i} First Name`] = finalFirstName;
      (record as any)[`Officer ${i} Last Name`] = finalLastName;
      (record as any)[`Officer ${i} Address`] = officerAddress;
      (record as any)[`Officer ${i} Role`] = officerRole;
      (record as any)[`Officer ${i} SSN`] = officersAllOwners
        ? (owners[i - 1]?.tin || owners[i - 1]?.ssn || '')
        : (admin[`officer${i}SSN`] || '');
      
      console.log(`📋 Mapping Officer ${i}: Name="${officerName || `${finalFirstName} ${finalLastName}`.trim()}", Role="${officerRole}", officersAllOwners=${officersAllOwners}`);
    }
  }
  
  // Map Managers (LLC)
  if (isLLC) {
    const managersCount = admin.managersCount || 0;
    record['Managers Count'] = managersCount;
    
    // Managers are stored as dynamic keys: manager1FirstName, manager1LastName, manager1Address, etc.
    for (let i = 1; i <= Math.min(managersCount, 6); i++) {
      const managerFirstName = admin[`manager${i}FirstName`] || '';
      const managerLastName = admin[`manager${i}LastName`] || '';
      const managerName = admin[`manager${i}Name`] || `${managerFirstName} ${managerLastName}`.trim();
      
      let finalFirstName = managerFirstName;
      let finalLastName = managerLastName;
      if (!managerFirstName && !managerLastName && managerName) {
        const parsed = parseName(managerName);
        finalFirstName = parsed.first;
        finalLastName = parsed.last;
      }
      
      (record as any)[`Manager ${i} Name`] = managerName || `${finalFirstName} ${finalLastName}`.trim();
      (record as any)[`Manager ${i} First Name`] = finalFirstName;
      (record as any)[`Manager ${i} Last Name`] = finalLastName;
      (record as any)[`Manager ${i} Address`] = admin[`manager${i}Address`];
    }
  }
  
  // Map LLC Agreement Terms
  if (isLLC && agreement) {
    // Capital contributions per owner (stored as llc_capitalContributions_0, llc_capitalContributions_1, etc.)
    for (let i = 0; i < Math.min(owners.length, 6); i++) {
      const contribution = agreement[`llc_capitalContributions_${i}`];
      if (contribution) {
        (record as any)[`LLC Capital Contributions ${i + 1}`] = contribution;
      }
    }
    
    // Managing members
    record['LLC Managing Members'] = agreement.llc_managingMembers === 'Yes' ? 'Yes' : 'No';
    
    // Managing member flags (stored as llc_managingMember_0, llc_managingMember_1, etc.)
    for (let i = 0; i < Math.min(owners.length, 6); i++) {
      const isMM = agreement[`llc_managingMember_${i}`];
      if (isMM !== undefined) {
        (record as any)[`LLC Managing Member ${i + 1}`] = isMM ? 'Yes' : 'No';
      }
    }
    
    // Specific roles per owner (stored as llc_specificRoles_0, llc_specificRoles_1, etc.)
    for (let i = 0; i < Math.min(owners.length, 6); i++) {
      const role = agreement[`llc_specificRoles_${i}`];
      if (role) {
        (record as any)[`LLC Specific Roles ${i + 1}`] = role;
      }
    }
    
    // Decision thresholds (convert percentages to decimals)
    record['LLC New Members Admission'] = agreement.llc_newMembersAdmission;
    record['LLC New Members Majority %'] = agreement.llc_newMembersMajority ? agreement.llc_newMembersMajority / 100 : undefined;
    record['LLC Additional Contributions'] = agreement.llc_additionalContributions;
    record['LLC Additional Contributions Decision'] = agreement.llc_additionalContributionsDecision;
    record['LLC Additional Contributions Majority %'] = agreement.llc_additionalContributionsMajority ? agreement.llc_additionalContributionsMajority / 100 : undefined;
    record['LLC Withdraw Contributions'] = agreement.llc_withdrawContributions;
    record['LLC Member Loans'] = agreement.llc_memberLoans === 'Yes' ? 'Yes' : 'No';
    record['LLC Company Sale Decision'] = agreement.llc_companySaleDecision;
    record['LLC Company Sale Decision Majority %'] = agreement.llc_companySaleDecisionMajority ? agreement.llc_companySaleDecisionMajority / 100 : undefined;
    record['LLC Tax Partner'] = agreement.llc_taxPartner;
    record['LLC Non Compete'] = agreement.llc_nonCompete === 'Yes' ? 'Yes' : 'No';
    record['LLC Bank Signers'] = agreement.llc_bankSigners;
    record['LLC Major Decisions'] = agreement.llc_majorDecisions;
    record['LLC Major Decisions %'] = agreement.llc_majorDecisionsMajority ? agreement.llc_majorDecisionsMajority / 100 : undefined;
    record['LLC Minor Decisions'] = agreement.llc_minorDecisions;
    record['LLC Minor Decisions %'] = agreement.llc_minorDecisionsMajority ? agreement.llc_minorDecisionsMajority / 100 : undefined;
    record['LLC Manager Restrictions'] = agreement.llc_managerRestrictions;
    record['LLC Deadlock Resolution'] = agreement.llc_deadlockResolution;
    record['LLC Key Man Insurance'] = agreement.llc_keyManInsurance;
    record['LLC Dispute Resolution'] = agreement.llc_disputeResolution;
    record['LLC ROFR'] = agreement.llc_rofr === 'Yes' ? 'Yes' : 'No';
    record['LLC Incapacity Heirs Policy'] = agreement.llc_incapacityHeirsPolicy === 'Yes' ? 'Yes' : 'No';
    record['LLC New Partners Admission'] = agreement.llc_newPartnersAdmission;
    record['LLC New Partners Majority %'] = agreement.llc_newPartnersMajority ? agreement.llc_newPartnersMajority / 100 : undefined;
    record['LLC Dissolution Decision'] = agreement.llc_dissolutionDecision;
    record['LLC Dissolution Decision Majority %'] = agreement.llc_dissolutionDecisionMajority ? agreement.llc_dissolutionDecisionMajority / 100 : undefined;
    record['LLC Specific Terms'] = agreement.llc_specificTerms;
  }
  
  // Map C-Corp Agreement Terms
  if (isCorp && agreement) {
    // Capital per owner (stored as corp_capitalPerOwner_0, corp_capitalPerOwner_1, etc.)
    for (let i = 0; i < Math.min(owners.length, 6); i++) {
      const capital = agreement[`corp_capitalPerOwner_${i}`];
      if (capital) {
        (record as any)[`Corp Capital Per Owner ${i + 1}`] = capital;
      }
    }
    
    // Specific responsibilities per owner (stored as corp_specificResponsibilities_0, etc.)
    for (let i = 0; i < Math.min(owners.length, 6); i++) {
      const responsibility = agreement[`corp_specificResponsibilities_${i}`];
      if (responsibility) {
        (record as any)[`Corp Specific Responsibilities ${i + 1}`] = responsibility;
      }
    }
    
    // Decision thresholds (convert percentages to decimals)
    record['Corp Hours Commitment'] = agreement.corp_hoursCommitment;
    record['Corp New Shareholders Admission'] = agreement.corp_newShareholdersAdmission;
    record['Corp New Shareholders Majority %'] = agreement.corp_newShareholdersMajority ? agreement.corp_newShareholdersMajority / 100 : undefined;
    record['Corp More Capital Process'] = agreement.corp_moreCapitalProcess;
    record['Corp More Capital Decision'] = agreement.corp_moreCapitalDecision;
    record['Corp More Capital Majority %'] = agreement.corp_moreCapitalMajority ? agreement.corp_moreCapitalMajority / 100 : undefined;
    record['Corp Withdraw Funds Policy'] = agreement.corp_withdrawFundsPolicy;
    record['Corp Sale Decision Threshold'] = agreement.corp_saleDecisionThreshold;
    record['Corp Sale Decision Majority %'] = agreement.corp_saleDecisionMajority ? agreement.corp_saleDecisionMajority / 100 : undefined;
    record['Corp Bank Signers'] = agreement.corp_bankSigners;
    record['Corp Major Decision Threshold'] = agreement.corp_majorDecisionThreshold;
    record['Corp Major Decision Majority %'] = agreement.corp_majorDecisionMajority ? agreement.corp_majorDecisionMajority / 100 : undefined;
    record['Corp Shareholder Loans'] = agreement.corp_shareholderLoans === 'Yes' ? 'Yes' : 'No';
    record['Corp Tax Owner'] = agreement.corp_taxOwner;
    record['Corp Non Compete'] = agreement.corp_nonCompete === 'Yes' ? 'Yes' : 'No';
    record['Corp ROFR'] = agreement.corp_rofr === 'Yes' ? 'Yes' : 'No';
    record['Corp Transfer To Relatives'] = agreement.corp_transferToRelatives;
    record['Corp Transfer To Relatives Majority %'] = agreement.corp_transferToRelativesMajority ? agreement.corp_transferToRelativesMajority / 100 : undefined;
    record['Corp Incapacity Heirs Policy'] = agreement.corp_incapacityHeirsPolicy === 'Yes' ? 'Yes' : 'No';
    record['Corp Divorce Buyout Policy'] = agreement.corp_divorceBuyoutPolicy === 'Yes' ? 'Yes' : 'No';
    record['Corp Tag Drag Rights'] = agreement.corp_tagDragRights === 'Yes' ? 'Yes' : 'No';
    record['Corp Additional Clauses'] = agreement.corp_additionalClauses;
  }
  
  return record;
}

