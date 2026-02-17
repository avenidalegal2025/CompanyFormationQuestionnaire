/**
 * Trigger one formation for EC2 autofill so you can watch it run in VNC.
 * Sets a Florida formation record to Formation Status = Pending, Autofill = Yes.
 * Supports LLC, C-Corp, and S-Corp entity types.
 * The watcher on EC2 will pick it up within ~30 seconds.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/trigger-formation-autofill.ts
 *   npx ts-node --project tsconfig.scripts.json scripts/trigger-formation-autofill.ts recXXXXXXXXXXXXXX
 *
 * Requires: .env.local with AIRTABLE_API_KEY, AIRTABLE_BASE_ID (and AIRTABLE_TABLE_NAME optional).
 */

import * as fs from 'fs';
import * as path from 'path';
import Airtable from 'airtable';

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

// Supported entity types for Sunbiz filing
const SUPPORTED_ENTITY_TYPES = ['LLC', 'C-Corp', 'S-Corp'];

async function main() {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('❌ Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env.local');
    process.exit(1);
  }

  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
  const table = base(AIRTABLE_TABLE_NAME);
  const recordIdArg = process.argv[2];

  let recordId: string;
  let companyName: string;
  let entityType: string;

  if (recordIdArg && recordIdArg.startsWith('rec')) {
    // Specific record (fetch by RECORD_ID() formula)
    recordId = recordIdArg;
    const rows = await table
      .select({ filterByFormula: `RECORD_ID() = '${recordId}'`, maxRecords: 1 })
      .firstPage();
    if (!rows.length) {
      console.error(`❌ Record not found: ${recordId}`);
      process.exit(1);
    }
    const rec = rows[0];
    companyName = (rec.get('Company Name') as string) || 'Unknown';
    const state = rec.get('Formation State') as string;
    entityType = (rec.get('Entity Type') as string) || '';
    const paymentId = rec.get('Stripe Payment ID') as string;

    if (state !== 'Florida') {
      console.error(`❌ Record is not a Florida formation (State: ${state})`);
      process.exit(1);
    }
    if (!SUPPORTED_ENTITY_TYPES.includes(entityType)) {
      console.error(`❌ Unsupported entity type: '${entityType}'. Supported: ${SUPPORTED_ENTITY_TYPES.join(', ')}`);
      process.exit(1);
    }
    if (!paymentId) {
      console.error('❌ Record has no Stripe Payment ID');
      process.exit(1);
    }
  } else {
    // Find first eligible: Florida LLC/C-Corp/S-Corp, has Stripe Payment ID, status Pending or In Progress
    const formula = `AND(
      {Formation State} = 'Florida',
      OR(
        {Entity Type} = 'LLC',
        {Entity Type} = 'C-Corp',
        {Entity Type} = 'S-Corp'
      ),
      {Stripe Payment ID} != '',
      OR({Formation Status} = 'Pending', {Formation Status} = 'In Progress')
    )`;
    const records = await table.select({ filterByFormula: formula, maxRecords: 1, sort: [{ field: 'Payment Date', direction: 'desc' }] }).firstPage();
    if (!records.length) {
      console.error('❌ No eligible record found. Need a Florida LLC/C-Corp/S-Corp with Stripe Payment ID and Formation Status Pending or In Progress.');
      process.exit(1);
    }
    const rec = records[0];
    recordId = rec.id;
    companyName = (rec.get('Company Name') as string) || 'Unknown';
    entityType = (rec.get('Entity Type') as string) || 'Unknown';
  }

  console.log(`\n🎯 Triggering formation for: ${companyName} (${entityType}) [${recordId}]\n`);

  await table.update([
    {
      id: recordId,
      fields: {
        'Formation Status': 'Pending',
        Autofill: 'Yes',
      },
    },
  ]);

  console.log('✅ Airtable updated: Formation Status = Pending, Autofill = Yes');
  console.log(`\n👀 On EC2 the watcher will pick this up within ~30 seconds.`);
  console.log(`   Entity type: ${entityType} → dispatcher will route to correct filing script.`);
  console.log('   Watch the VNC session to see the browser open Sunbiz and fill the form.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
