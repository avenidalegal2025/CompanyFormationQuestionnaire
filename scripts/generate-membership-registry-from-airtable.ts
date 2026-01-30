#!/usr/bin/env ts-node
/**
 * Generate Membership Registry for an LLC from Airtable
 * 
 * This script:
 * 1. Queries Airtable to find LLC records
 * 2. Generates Membership Registry for the first LLC found (or a specific recordId)
 * 
 * Usage:
 *   npx ts-node scripts/generate-membership-registry-from-airtable.ts [recordId]
 */

import Airtable from 'airtable';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local if it exists
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  }
} catch (error) {
  // Ignore errors loading .env.local
}

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 
                 (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('❌ Missing Airtable credentials');
  console.error('   AIRTABLE_API_KEY:', AIRTABLE_API_KEY ? '✅' : '❌');
  console.error('   AIRTABLE_BASE_ID:', AIRTABLE_BASE_ID ? '✅' : '❌');
  console.error('\nPlease set these in .env.local or environment variables');
  process.exit(1);
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

async function findLLCRecord(recordId?: string): Promise<any> {
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
    } catch (error: any) {
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
      return record;
    }
  }

  // Fallback to first record
  console.log(`📋 Using first record: ${records[0].id}`);
  return records[0];
}

async function generateMembershipRegistry(recordId: string): Promise<void> {
  console.log(`\n📄 Generating Membership Registry for record: ${recordId}`);
  console.log(`🔗 Calling: ${BASE_URL}/api/airtable/generate-membership-registry`);
  
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

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const result = await response.json();
      console.log('\n✅ Membership Registry generated successfully!');
      console.log(`📁 S3 Key: ${result.s3Key}`);
      console.log(`📊 Size: ${result.docxSize || 'N/A'} bytes`);
      if (result.viewUrl) {
        console.log(`🔗 View URL: ${result.viewUrl}`);
      }
      if (result.airtableUpdated) {
        console.log(`✅ Airtable record updated with Membership Registry URL`);
      }
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
    }
  } catch (error: any) {
    console.error(`❌ Error calling API:`, error.message);
    console.error(`❌ Stack:`, error.stack);
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

  await generateMembershipRegistry(record.id);
  
  console.log('\n✅ Done!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
