#!/usr/bin/env node
/**
 * Generate Membership Registry using provided Airtable credentials
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

  // Fallback to first record
  console.log(`📋 Using first record: ${records[0].id}`);
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
      'x-internal-key': process.env.INTERNAL_API_KEY || '',
      },
      body: JSON.stringify({
        recordId: recordId,
        updateAirtable: true,
      }),
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}\n`);

    if (response.ok) {
      const result = await response.json();
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
      const errorText = await response.text();
      console.error(`❌ Failed to generate Membership Registry: ${response.status}`);
      console.error(`❌ Error: ${errorText}`);
      try {
        const errorJson = JSON.parse(errorText);
        console.error(`❌ Error details:`, JSON.stringify(errorJson, null, 2));
      } catch {
        // Not JSON, already printed as text
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
  
  console.log('🚀 Membership Registry Generator\n');
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
