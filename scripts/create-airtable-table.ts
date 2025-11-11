/**
 * Airtable Table Creation Script
 * 
 * This script creates the "Formations" table with all 219 fields programmatically.
 * 
 * Prerequisites:
 *   1. Create a base in Airtable called "Avenida Legal CRM"
 *   2. Get your Base ID from the URL (starts with "app...")
 *   3. Create a Personal Access Token with these scopes:
 *      - schema.bases:read
 *      - schema.bases:write
 *   4. Set environment variables:
 *      AIRTABLE_API_KEY=patXXXXXXXXXXXXXXXX
 *      AIRTABLE_BASE_ID=appXXXXXXXXXXXXXXXX
 * 
 * Usage:
 *   npx ts-node scripts/create-airtable-table.ts
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('❌ Missing environment variables:');
  console.error('   AIRTABLE_API_KEY:', AIRTABLE_API_KEY ? '✅ Set' : '❌ Missing');
  console.error('   AIRTABLE_BASE_ID:', AIRTABLE_BASE_ID ? '✅ Set' : '❌ Missing');
  console.error('\nPlease set these variables and try again.');
  process.exit(1);
}

// Field definitions
const fields = [
  // Core Information (11 fields)
  { name: 'Company Name', type: 'singleLineText' },
  { name: 'Entity Type', type: 'singleSelect', options: { choices: [{ name: 'LLC' }, { name: 'C-Corp' }] } },
  { name: 'Formation State', type: 'singleLineText' },
  { name: 'Formation Status', type: 'singleSelect', options: { choices: [{ name: 'Pending' }, { name: 'In Progress' }, { name: 'Completed' }, { name: 'Filed' }] } },
  { name: 'Customer Email', type: 'email' },
  { name: 'Customer Name', type: 'singleLineText' },
  { name: 'Total Payment Amount', type: 'currency', options: { precision: 2, symbol: '$' } },
  { name: 'Products Purchased', type: 'multilineText' },
  { name: 'Payment Date', type: 'date', options: { dateFormat: { name: 'us', format: 'M/D/YYYY' } } },
  { name: 'Stripe Payment ID', type: 'singleLineText' },
  
  // Company Details (5 fields)
  { name: 'Company Address', type: 'multilineText' },
  { name: 'Business Purpose', type: 'multilineText' },
  { name: 'Number of Shares', type: 'number', options: { precision: 0 } },
  { name: 'Vault Path', type: 'singleLineText' },
  { name: 'Has US Phone', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  
  // Phone & Contact (2 fields)
  { name: 'Business Phone', type: 'phoneNumber' },
  { name: 'Forward Phone', type: 'phoneNumber' },
];

// Add Owners (42 fields - 7 per owner × 6 owners)
for (let i = 1; i <= 6; i++) {
  fields.push(
    { name: `Owner ${i} Name`, type: 'singleLineText' },
    { name: `Owner ${i} Ownership %`, type: 'percent', options: { precision: 2 } },
    { name: `Owner ${i} Email`, type: 'email' },
    { name: `Owner ${i} Phone`, type: 'phoneNumber' },
    { name: `Owner ${i} Address`, type: 'multilineText' },
    { name: `Owner ${i} SSN`, type: 'singleLineText' },
    { name: `Owner ${i} ID Document URL`, type: 'url' }
  );
}

// Add Owner Count
fields.push({ name: 'Owner Count', type: 'number', options: { precision: 0 } });

// Add Directors (12 fields - 2 per director × 6 directors)
fields.push({ name: 'Directors Count', type: 'number', options: { precision: 0 } });
for (let i = 1; i <= 6; i++) {
  fields.push(
    { name: `Director ${i} Name`, type: 'singleLineText' },
    { name: `Director ${i} Address`, type: 'multilineText' }
  );
}

// Add Officers (18 fields - 3 per officer × 6 officers)
fields.push({ name: 'Officers Count', type: 'number', options: { precision: 0 } });
for (let i = 1; i <= 6; i++) {
  fields.push(
    { name: `Officer ${i} Name`, type: 'singleLineText' },
    { name: `Officer ${i} Address`, type: 'multilineText' },
    { name: `Officer ${i} Role`, type: 'singleLineText' }
  );
}

// Add Managers (12 fields - 2 per manager × 6 managers)
fields.push({ name: 'Managers Count', type: 'number', options: { precision: 0 } });
for (let i = 1; i <= 6; i++) {
  fields.push(
    { name: `Manager ${i} Name`, type: 'singleLineText' },
    { name: `Manager ${i} Address`, type: 'multilineText' }
  );
}

// Documents (3 fields)
fields.push(
  { name: 'Membership Registry URL', type: 'url' },
  { name: 'Organizational Resolution URL', type: 'url' },
  { name: 'Operating Agreement URL', type: 'url' }
);

// Agreement
fields.push({ name: 'Want Agreement', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } });

// LLC Agreement Terms
for (let i = 1; i <= 6; i++) {
  fields.push(
    { name: `LLC Capital Contributions ${i}`, type: 'multilineText' },
    { name: `LLC Managing Member ${i}`, type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
    { name: `LLC Specific Roles ${i}`, type: 'multilineText' }
  );
}

fields.push(
  { name: 'LLC Managing Members', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'LLC New Members Admission', type: 'singleLineText' },
  { name: 'LLC New Members Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'LLC Additional Contributions', type: 'singleLineText' },
  { name: 'LLC Additional Contributions Decision', type: 'singleLineText' },
  { name: 'LLC Additional Contributions Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'LLC Withdraw Contributions', type: 'multilineText' },
  { name: 'LLC Member Loans', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'LLC Company Sale Decision', type: 'singleLineText' },
  { name: 'LLC Company Sale Decision Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'LLC Tax Partner', type: 'multilineText' },
  { name: 'LLC Non Compete', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'LLC Bank Signers', type: 'singleLineText' },
  { name: 'LLC Major Decisions', type: 'singleLineText' },
  { name: 'LLC Minor Decisions', type: 'singleLineText' },
  { name: 'LLC Manager Restrictions', type: 'multilineText' },
  { name: 'LLC Deadlock Resolution', type: 'multilineText' },
  { name: 'LLC Key Man Insurance', type: 'multilineText' },
  { name: 'LLC Dispute Resolution', type: 'multilineText' },
  { name: 'LLC ROFR', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'LLC Incapacity Heirs Policy', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'LLC New Partners Admission', type: 'singleLineText' },
  { name: 'LLC New Partners Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'LLC Dissolution Decision', type: 'singleLineText' },
  { name: 'LLC Dissolution Decision Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'LLC Specific Terms', type: 'multilineText' }
);

// C-Corp Agreement Terms
for (let i = 1; i <= 6; i++) {
  fields.push(
    { name: `Corp Capital Per Owner ${i}`, type: 'multilineText' },
    { name: `Corp Specific Responsibilities ${i}`, type: 'multilineText' }
  );
}

fields.push(
  { name: 'Corp Hours Commitment', type: 'multilineText' },
  { name: 'Corp New Shareholders Admission', type: 'singleLineText' },
  { name: 'Corp New Shareholders Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'Corp More Capital Process', type: 'singleLineText' },
  { name: 'Corp More Capital Decision', type: 'singleLineText' },
  { name: 'Corp More Capital Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'Corp Withdraw Funds Policy', type: 'multilineText' },
  { name: 'Corp Sale Decision Threshold', type: 'singleLineText' },
  { name: 'Corp Sale Decision Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'Corp Bank Signers', type: 'singleLineText' },
  { name: 'Corp Major Decision Threshold', type: 'singleLineText' },
  { name: 'Corp Major Decision Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'Corp Shareholder Loans', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'Corp Non Compete', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'Corp ROFR', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'Corp Transfer To Relatives', type: 'multilineText' },
  { name: 'Corp Transfer To Relatives Majority %', type: 'percent', options: { precision: 0 } },
  { name: 'Corp Incapacity Heirs Policy', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'Corp Divorce Buyout Policy', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'Corp Tag Drag Rights', type: 'singleSelect', options: { choices: [{ name: 'Yes' }, { name: 'No' }] } },
  { name: 'Corp Additional Clauses', type: 'multilineText' }
);

// Admin (2 fields)
fields.push(
  { name: 'Notes', type: 'multilineText' },
  { name: 'Internal Status', type: 'singleSelect', options: { choices: [{ name: 'New' }, { name: 'Contacted' }, { name: 'Documents Sent' }, { name: 'Filed' }, { name: 'Complete' }] } }
);

async function createTable() {
  console.log('🚀 Creating Airtable Table\n');
  console.log('═'.repeat(50));
  console.log(`Base ID: ${AIRTABLE_BASE_ID}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Fields: ${fields.length}`);
  console.log('═'.repeat(50) + '\n');

  try {
    console.log('📡 Sending request to Airtable API...\n');
    
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: TABLE_NAME,
        description: 'Company formation questionnaire data - automatically synced from Stripe payments',
        fields: fields,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to create table');
      console.error(`Status: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}\n`);
      
      if (response.status === 401) {
        console.error('💡 Authentication failed. Please check:');
        console.error('   1. Your AIRTABLE_API_KEY is correct');
        console.error('   2. Your token has these scopes:');
        console.error('      - schema.bases:read');
        console.error('      - schema.bases:write');
        console.error('   3. Your token has access to this base\n');
      } else if (response.status === 422) {
        console.error('💡 The table might already exist or there\'s a validation error.');
        console.error('   Try deleting the existing "Formations" table and run this script again.\n');
      }
      
      process.exit(1);
    }

    const result = await response.json();
    
    console.log('✅ Table created successfully!\n');
    console.log(`Table ID: ${result.id}`);
    console.log(`Table Name: ${result.name}`);
    console.log(`Fields Created: ${result.fields.length}\n`);
    
    console.log('📋 Sample fields:');
    result.fields.slice(0, 10).forEach((field: any) => {
      console.log(`   - ${field.name} (${field.type})`);
    });
    if (result.fields.length > 10) {
      console.log(`   ... and ${result.fields.length - 10} more\n`);
    }
    
    console.log('✅ Setup complete! Your Airtable table is ready.\n');
    console.log('📋 Next steps:');
    console.log('   1. Add these environment variables to Vercel:');
    console.log(`      AIRTABLE_API_KEY=${AIRTABLE_API_KEY?.substring(0, 10)}...`);
    console.log(`      AIRTABLE_BASE_ID=${AIRTABLE_BASE_ID}`);
    console.log(`      AIRTABLE_TABLE_NAME=${TABLE_NAME}`);
    console.log('   2. Deploy your app');
    console.log('   3. Complete a test payment to see data sync automatically\n');
    
  } catch (error: any) {
    console.error('❌ Error creating table:', error.message);
    process.exit(1);
  }
}

createTable();

