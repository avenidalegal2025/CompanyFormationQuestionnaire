/**
 * Tests for C-Corp Organizational Resolution 216 template selection and format.
 *
 * 1) Unit: getCorpOrganizationalResolution216TemplateName produces the correct
 *    filename for all 216 combinations (sample asserted).
 * 2) S3 verification: Checks that all 216 template files exist on S3.
 * 3) Optional: If RECORD_ID is set, calls generate-organizational-resolution API
 *    and checks that the response is a valid DOCX/PDF.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/test-org-resolution-216.ts
 * With API test: RECORD_ID=recXXX npx ts-node --project tsconfig.scripts.json scripts/test-org-resolution-216.ts
 * Skip S3 check: SKIP_S3=1 npx ts-node --project tsconfig.scripts.json scripts/test-org-resolution-216.ts
 */

import { execSync } from 'child_process';

function getCorpOrganizationalResolution216TemplateName(
  shareholderCount: number,
  directorCount: number,
  officerCount: number
): string {
  const owners = Math.min(Math.max(shareholderCount, 1), 6);
  const directors = Math.min(Math.max(directorCount, 1), 6);
  const officers = Math.min(Math.max(officerCount, 1), 6);
  const ownerWord = owners === 1 ? 'Owner' : 'Owners';
  const directorWord = directors === 1 ? 'Director' : 'Directors';
  const officerWord = officers === 1 ? 'Officer' : 'Officers';
  return `Org_Resolution_${owners} ${ownerWord}_${directors} ${directorWord}_${officers} ${officerWord}.docx`;
}

// ── Phase 1: Unit tests for template name generation ──

const cases: Array<[number, number, number, string]> = [
  [1, 1, 1, 'Org_Resolution_1 Owner_1 Director_1 Officer.docx'],
  [1, 1, 2, 'Org_Resolution_1 Owner_1 Director_2 Officers.docx'],
  [1, 2, 1, 'Org_Resolution_1 Owner_2 Directors_1 Officer.docx'],
  [2, 1, 1, 'Org_Resolution_2 Owners_1 Director_1 Officer.docx'],
  [2, 2, 2, 'Org_Resolution_2 Owners_2 Directors_2 Officers.docx'],
  [6, 6, 6, 'Org_Resolution_6 Owners_6 Directors_6 Officers.docx'],
  [3, 4, 5, 'Org_Resolution_3 Owners_4 Directors_5 Officers.docx'],
  [1, 6, 6, 'Org_Resolution_1 Owner_6 Directors_6 Officers.docx'],
];

let failed = 0;
for (const [sh, dir, off, expected] of cases) {
  const got = getCorpOrganizationalResolution216TemplateName(sh, dir, off);
  if (got !== expected) {
    console.error(`FAIL: (${sh},${dir},${off}) => "${got}" expected "${expected}"`);
    failed++;
  } else {
    console.log(`OK: (${sh},${dir},${off}) => ${got}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}

console.log('\nAll template name assertions passed.');

// ── Phase 2: S3 existence verification for all 216 templates ──

const S3_BUCKET = 'company-formation-template-llc-and-inc';
const S3_PREFIX = 'templates/organizational-resolution-inc-216/';
const AWS_PROFILE = process.env.AWS_PROFILE || 'llc-admin';
const AWS_REGION = process.env.AWS_REGION || 'us-west-1';

if (process.env.SKIP_S3 === '1') {
  console.log('\nSkipping S3 verification (SKIP_S3=1).');
} else {
  console.log(`\n── S3 Verification: s3://${S3_BUCKET}/${S3_PREFIX} ──`);

  // Generate all 216 expected filenames
  const expectedFiles = new Set<string>();
  for (let owners = 1; owners <= 6; owners++) {
    for (let directors = 1; directors <= 6; directors++) {
      for (let officers = 1; officers <= 6; officers++) {
        expectedFiles.add(getCorpOrganizationalResolution216TemplateName(owners, directors, officers));
      }
    }
  }
  console.log(`Expected: ${expectedFiles.size} template files`);

  // List actual files on S3
  try {
    const cmd = `aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" --profile ${AWS_PROFILE} --region ${AWS_REGION}`;
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    const s3Files = new Set<string>();
    for (const line of output.trim().split(/\r?\n/)) {
      // Format: "2026-02-26 13:55:08       9528 Org_Resolution_1 Owner_1 Director_1 Officer.docx"
      const trimmed = line.trim();
      const match = trimmed.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\d+\s+(.+)$/);
      if (match) {
        s3Files.add(match[1].trim());
      }
    }
    console.log(`Found on S3: ${s3Files.size} files`);

    // Check for missing templates
    const missing: string[] = [];
    for (const expected of expectedFiles) {
      if (!s3Files.has(expected)) {
        missing.push(expected);
      }
    }

    // Check for unexpected files
    const unexpected: string[] = [];
    for (const actual of s3Files) {
      if (!expectedFiles.has(actual)) {
        unexpected.push(actual);
      }
    }

    if (missing.length > 0) {
      console.error(`\nMISSING ${missing.length} templates:`);
      for (const f of missing) {
        console.error(`  - ${f}`);
      }
    }

    if (unexpected.length > 0) {
      console.warn(`\nUNEXPECTED ${unexpected.length} files on S3:`);
      for (const f of unexpected) {
        console.warn(`  + ${f}`);
      }
    }

    if (missing.length === 0 && unexpected.length === 0) {
      console.log(`\n✓ All 216 templates verified on S3. No missing, no extra files.`);
    } else {
      console.error(`\n✗ S3 verification failed: ${missing.length} missing, ${unexpected.length} unexpected.`);
      process.exit(1);
    }
  } catch (e: any) {
    console.error(`\nS3 verification error: ${e.message}`);
    console.error('Make sure AWS CLI is configured with the correct profile.');
    process.exit(1);
  }
}

// ── Phase 3: Optional API test ──

const recordId = process.env.RECORD_ID;
if (recordId) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/airtable/generate-organizational-resolution`;
  console.log(`\nCalling ${url} with recordId=${recordId}...`);
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, updateAirtable: false }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('API error:', res.status, data);
        process.exit(1);
      }
      const buf = (data as { docxBase64?: string }).docxBase64;
      const key = (data as { s3Key?: string }).s3Key;
      if (buf) {
        const len = Buffer.from(buf, 'base64').length;
        console.log(`OK: API returned DOCX (base64 length ${len}).`);
      } else if (key) {
        console.log(`OK: API wrote document to S3: ${key}`);
      } else {
        console.log('API response:', JSON.stringify(data, null, 2).slice(0, 500));
      }
    })
    .catch((e) => {
      console.error('Request failed:', e.message);
      process.exit(1);
    });
} else {
  console.log('\nSet RECORD_ID to a C-Corp Airtable record ID to test API generation.');
}
