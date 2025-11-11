/**
 * Backfill Airtable with existing DynamoDB data
 * 
 * This script retrieves form data from DynamoDB and creates Airtable records
 * for existing customers who paid before the Airtable integration was added.
 * 
 * Usage:
 *   npx ts-node scripts/backfill-airtable.ts <user-email>
 */

import { getFormData, getVaultMetadata, getUserDocuments } from '../src/lib/dynamo';
import { createFormationRecord, mapQuestionnaireToAirtable } from '../src/lib/airtable';

const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Please provide a user email:');
  console.error('   npx ts-node scripts/backfill-airtable.ts user@example.com');
  process.exit(1);
}

// Check required environment variables
const requiredEnvVars = [
  'AIRTABLE_API_KEY',
  'AIRTABLE_BASE_ID',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
];

const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error('❌ Missing environment variables:', missing.join(', '));
  console.error('\n💡 Make sure to set:');
  console.error('   export AWS_REGION=us-west-1');
  console.error('   export AWS_ACCESS_KEY_ID=...');
  console.error('   export AWS_SECRET_ACCESS_KEY=...');
  console.error('   export AIRTABLE_API_KEY=...');
  console.error('   export AIRTABLE_BASE_ID=...');
  process.exit(1);
}

async function backfillUser(email: string) {
  console.log('🔍 Fetching data for user:', email);
  console.log('═'.repeat(50));
  
  try {
    // Get form data
    const formData = await getFormData(email);
    if (!formData) {
      console.error('❌ No form data found for user:', email);
      console.error('💡 Make sure the user has completed a payment');
      return;
    }
    console.log('✅ Form data found');
    
    // Get vault metadata
    const vault = await getVaultMetadata(email);
    console.log('✅ Vault metadata:', vault?.vaultPath || 'Not found');
    
    // Get documents
    const documents = await getUserDocuments(email);
    console.log('✅ Documents found:', documents.length);
    
    // Build document URLs
    const documentUrls = {
      membershipRegistry: documents.find(d => d.id === 'membership-registry')?.s3Key,
      organizationalResolution: documents.find(d => d.id === 'organizational-resolution')?.s3Key,
      operatingAgreement: documents.find(d => d.id === 'operating-agreement' || d.id === 'shareholder-agreement')?.s3Key,
    };
    
    // Create a mock Stripe session object
    const mockSession = {
      id: 'backfill_' + Date.now(),
      customer_details: {
        email: email,
        name: formData?.company?.companyName || 'Customer',
      },
      amount_total: 138000, // Default amount, adjust if needed
      metadata: {
        selectedServices: JSON.stringify(['business_address', 'business_phone']),
      },
    };
    
    console.log('\n📊 Creating Airtable record...');
    
    // Map and create Airtable record
    const airtableRecord = mapQuestionnaireToAirtable(
      formData,
      mockSession as any,
      vault?.vaultPath,
      documentUrls
    );
    
    const recordId = await createFormationRecord(airtableRecord);
    
    console.log('\n✅ Airtable record created successfully!');
    console.log(`   Record ID: ${recordId}`);
    console.log(`   Company: ${airtableRecord['Company Name']}`);
    console.log(`   Entity Type: ${airtableRecord['Entity Type']}`);
    console.log(`   State: ${airtableRecord['Formation State']}`);
    console.log(`   View in Airtable: https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${recordId}`);
    
  } catch (error: any) {
    console.error('\n❌ Error backfilling data:', error.message);
    if (error.statusCode === 404) {
      console.error('💡 Make sure the Airtable table "Formations" exists');
    }
    process.exit(1);
  }
}

backfillUser(userEmail);

