#!/usr/bin/env node
/**
 * Test Membership Registry Generation
 * 
 * This script:
 * 1. Finds an LLC record in Airtable
 * 2. Generates Membership Registry using the API endpoint
 * 3. Shows the result
 */

const Airtable = require('airtable');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = 'app8Ggz2miYds1F38';
const AIRTABLE_TABLE_NAME = 'Formations';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

async function findLLCRecord(recordId) {
  if (recordId) {
    console.log(`🔍 Looking for specific record: ${recordId}`);
    try {
      const record = await base(AIRTABLE_TABLE_NAME).find(recordId);
      const entityType = record.fields['Entity Type'] || '';
      if (entityType !== 'LLC') {
        console.error(`❌ Record ${recordId} is not an LLC (Entity Type: ${entityType})`);
        return null;
      }
      return record;
    } catch (error) {
      console.error(`❌ Error fetching record ${recordId}:`, error.message);
      return null;
    }
  }

  console.log('🔍 Searching for LLC records in Airtable...');
  const records = await base(AIRTABLE_TABLE_NAME)
    .select({
      filterByFormula: "{Entity Type} = 'LLC'",
      maxRecords: 10,
      sort: [{ field: 'Payment Date', direction: 'desc' }],
    })
    .all();

  if (records.length === 0) {
    console.error('❌ No LLC records found in Airtable');
    return null;
  }

  console.log(`✅ Found ${records.length} LLC record(s)`);
  
  // Find one that has owner information
  for (const record of records) {
    const owner1Name = record.fields['Owner 1 Name'] || '';
    if (owner1Name) {
      console.log(`📋 Selected record: ${record.id}`);
      console.log(`   Company: ${record.fields['Company Name'] || 'N/A'}`);
      console.log(`   Owner 1: ${owner1Name}`);
      const ownerCount = record.fields['Owner Count'] || 0;
      const managerCount = record.fields['Managers Count'] || 0;
      console.log(`   Owners: ${ownerCount}, Managers: ${managerCount}`);
      return record;
    }
  }

  return records[0];
}

async function generateMembershipRegistry(recordId) {
  console.log(`\n📄 Generating Membership Registry for record: ${recordId}`);
  console.log(`🔗 Calling: ${BASE_URL}/api/airtable/generate-membership-registry\n`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/airtable/generate-membership-registry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recordId: recordId,
        updateAirtable: true,
      }),
    });

    const responseText = await response.text();
    console.log(`📡 Response status: ${response.status} ${response.statusText}\n`);

    if (response.ok) {
      const result = JSON.parse(responseText);
      console.log('✅ Membership Registry generated successfully!');
      console.log(`📁 S3 Key: ${result.s3Key}`);
      console.log(`📊 Size: ${result.docxSize || 'N/A'} bytes`);
      if (result.viewUrl) {
        console.log(`🔗 View URL: ${result.viewUrl}`);
      }
      if (result.airtableUpdated) {
        console.log(`✅ Airtable record updated with Membership Registry URL`);
      }
      console.log('\n✅ Done!');
      return true;
    } else {
      console.error(`❌ Failed to generate Membership Registry: ${response.status}`);
      try {
        const errorJson = JSON.parse(responseText);
        console.error(`❌ Error: ${errorJson.error || responseText}`);
        if (errorJson.error === 'LAMBDA_MEMBERSHIP_REGISTRY_URL not configured') {
          console.error('\n⚠️  Lambda URL not configured in Vercel environment variables.');
          console.error('   To fix:');
          console.error('   1. Go to Vercel project settings');
          console.error('   2. Add environment variable: LAMBDA_MEMBERSHIP_REGISTRY_URL');
          console.error('   3. Set it to your Lambda function URL');
          console.error('   4. Redeploy');
        }
      } catch {
        console.error(`❌ Error: ${responseText}`);
      }
      return false;
    }
  } catch (error) {
    console.error(`❌ Error calling API:`, error.message);
    console.error(`❌ Stack:`, error.stack);
    return false;
  }
}

async function main() {
  const recordId = process.argv[2];
  
  console.log('🚀 Membership Registry Test Generator\n');
  console.log(`📊 Airtable Base: ${AIRTABLE_BASE_ID}`);
  console.log(`📋 Table: ${AIRTABLE_TABLE_NAME}`);
  console.log(`🌐 API Base URL: ${BASE_URL}\n`);

  const record = await findLLCRecord(recordId);
  
  if (!record) {
    console.error('❌ No LLC record found to process');
    process.exit(1);
  }

  const success = await generateMembershipRegistry(record.id);
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
