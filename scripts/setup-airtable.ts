/**
 * Airtable Setup Script
 * 
 * This script helps you set up the Airtable base with all required fields.
 * 
 * Usage:
 *   1. Create a new base in Airtable called "Avenida Legal CRM"
 *   2. Create a table named "Formations"
 *   3. Set environment variables:
 *      - AIRTABLE_API_KEY (Personal Access Token)
 *      - AIRTABLE_BASE_ID (from the URL, starts with "app...")
 *   4. Run: npx ts-node scripts/setup-airtable.ts
 */

import Airtable from 'airtable';

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

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

async function testConnection() {
  console.log('🔍 Testing Airtable connection...\n');
  
  try {
    // Try to list records (will fail if table doesn't exist)
    const records = await base(TABLE_NAME).select({ maxRecords: 1 }).firstPage();
    
    console.log('✅ Connection successful!');
    console.log(`✅ Table "${TABLE_NAME}" exists`);
    console.log(`📊 Current record count: ${records.length === 0 ? '0 (empty)' : `${records.length}+`}\n`);
    
    if (records.length > 0) {
      const fields = Object.keys(records[0].fields);
      console.log(`📋 Existing fields (${fields.length}):`);
      fields.slice(0, 10).forEach(field => console.log(`   - ${field}`));
      if (fields.length > 10) {
        console.log(`   ... and ${fields.length - 10} more`);
      }
    }
    
    return true;
  } catch (error: any) {
    if (error.statusCode === 404) {
      console.error(`❌ Table "${TABLE_NAME}" not found in base ${AIRTABLE_BASE_ID}`);
      console.error('\n📝 Please create the table manually:');
      console.error('   1. Go to https://airtable.com');
      console.error(`   2. Open your base (ID: ${AIRTABLE_BASE_ID})`);
      console.error(`   3. Create a table named "${TABLE_NAME}"`);
      console.error('   4. Import the CSV template: airtable-formations-template.csv');
    } else {
      console.error('❌ Connection failed:', error.message);
    }
    return false;
  }
}

async function createTestRecord() {
  console.log('\n🧪 Creating test record...\n');
  
  try {
    const testRecord = {
      'Company Name': 'Test Company LLC',
      'Entity Type': 'LLC',
      'Formation State': 'Florida',
      'Formation Status': 'Pending',
      'Customer Email': 'test@example.com',
      'Customer Name': 'Test User',
      'Total Payment Amount': 1380.00,
      'Products Purchased': 'LLC Formation, Business Address, Business Phone',
      'Payment Date': new Date().toISOString().split('T')[0],
      'Stripe Payment ID': 'test_' + Date.now(),
      'Internal Status': 'New',
    };
    
    const records = await base(TABLE_NAME).create([{ fields: testRecord }]);
    
    console.log('✅ Test record created successfully!');
    console.log(`   Record ID: ${records[0].id}`);
    console.log(`   Company: ${testRecord['Company Name']}`);
    console.log(`   View in Airtable: https://airtable.com/${AIRTABLE_BASE_ID}/${records[0].id}\n`);
    
    return records[0].id;
  } catch (error: any) {
    console.error('❌ Failed to create test record:', error.message);
    if (error.statusCode === 422) {
      console.error('\n💡 This usually means some fields are missing or have the wrong type.');
      console.error('   Make sure you imported the CSV template and adjusted field types.');
    }
    return null;
  }
}

async function main() {
  console.log('🚀 Airtable Setup Script\n');
  console.log('═'.repeat(50));
  console.log(`Base ID: ${AIRTABLE_BASE_ID}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log('═'.repeat(50) + '\n');
  
  const connected = await testConnection();
  
  if (connected) {
    const recordId = await createTestRecord();
    
    if (recordId) {
      console.log('✅ Setup complete! Your Airtable integration is ready.');
      console.log('\n📋 Next steps:');
      console.log('   1. Add these environment variables to Vercel:');
      console.log(`      AIRTABLE_API_KEY=${AIRTABLE_API_KEY?.substring(0, 10)}...`);
      console.log(`      AIRTABLE_BASE_ID=${AIRTABLE_BASE_ID}`);
      console.log(`      AIRTABLE_TABLE_NAME=${TABLE_NAME}`);
      console.log('   2. Deploy your app');
      console.log('   3. Complete a test payment to see data sync automatically\n');
    }
  } else {
    console.log('\n❌ Setup incomplete. Please follow the instructions above.');
  }
}

main().catch(console.error);

