/**
 * Regenerate Membership Registry and Organizational Resolution for a company.
 * Uses Airtable to find the record (by company name or recordId) then calls
 * the internal APIs (same as admin "Regenerar formation docs").
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/regenerate-formation-docs.ts "AVENIDA E2E TEST 847292"
 *   npx ts-node --project tsconfig.scripts.json scripts/regenerate-formation-docs.ts "E2E Format Verify Florida"
 *   npx ts-node --project tsconfig.scripts.json scripts/regenerate-formation-docs.ts recXXXXXXXXXXXXXX
 *
 * Requires: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME in env (e.g. from .env.local).
 * Base URL defaults to production so generation runs on Vercel with correct Lambda/S3 env.
 */

import Airtable from 'airtable';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local if it exists
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  }
} catch {
  // Ignore errors loading .env.local
}

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://company-formation-questionnaire.vercel.app');

async function findRecordId(query: string): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID');
  }
  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
  const normalizedQuery = query.toLowerCase().trim().replace(/"/g, '""');
  return new Promise((resolve, reject) => {
    base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `OR(FIND("${normalizedQuery}", LOWER({Company Name})), FIND("${normalizedQuery}", LOWER({Customer Email})))`,
        maxRecords: 5,
      })
      .firstPage((err, records) => {
        if (err) {
          reject(err);
          return;
        }
        if (!records || records.length === 0) {
          reject(new Error(`No Airtable record found for: ${query}`));
          return;
        }
        const first = records[0];
        const name = (first.fields as Record<string, unknown>)['Company Name'] as string;
        console.log(`Found: ${name} (${first.id})`);
        resolve(first.id);
      });
  });
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx ts-node --project tsconfig.scripts.json scripts/regenerate-formation-docs.ts "<company name or search>" | <recordId>');
    console.error('Example: scripts/regenerate-formation-docs.ts "AVENIDA E2E TEST 847292"');
    process.exit(1);
  }

  let recordId: string;
  if (arg.startsWith('rec')) {
    recordId = arg;
    console.log(`Using recordId: ${recordId}`);
  } else {
    console.log(`Searching Airtable for: ${arg}`);
    recordId = await findRecordId(arg);
  }

  console.log(`\nRegenerating formation docs at ${BASE_URL} for record: ${recordId}\n`);

  const membershipUrl = `${BASE_URL}/api/airtable/generate-membership-registry`;
  const orgResolutionUrl = `${BASE_URL}/api/airtable/generate-organizational-resolution`;

  let membershipOk = false;
  let orgResolutionOk = false;

  try {
    const mrRes = await fetch(membershipUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId, updateAirtable: true }),
    });
    const mrData = await mrRes.json().catch(() => ({}));
    membershipOk = mrRes.ok;
    if (mrRes.ok) {
      console.log('Membership Registry: OK', (mrData as { s3Key?: string }).s3Key || '');
    } else {
      console.log('Membership Registry: FAIL', (mrData as { error?: string }).error || mrRes.statusText);
    }
  } catch (e: unknown) {
    console.log('Membership Registry: ERROR', e instanceof Error ? e.message : String(e));
  }

  try {
    const orRes = await fetch(orgResolutionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId, updateAirtable: true }),
    });
    const orData = await orRes.json().catch(() => ({}));
    orgResolutionOk = orRes.ok;
    if (orRes.ok) {
      console.log('Organizational Resolution: OK', (orData as { s3Key?: string }).s3Key || '');
    } else {
      console.log('Organizational Resolution: FAIL', (orData as { error?: string }).error || orRes.statusText);
    }
  } catch (e: unknown) {
    console.log('Organizational Resolution: ERROR', e instanceof Error ? e.message : String(e));
  }

  if (membershipOk && orgResolutionOk) {
    console.log('\nDone. Refresh the client dashboard and re-download to verify (e.g. date format).');
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
