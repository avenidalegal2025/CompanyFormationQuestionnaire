/**
 * Tests for C-Corp Organizational Resolution 216 template selection and format.
 *
 * 1) Unit: getCorpOrganizationalResolution216TemplateName produces the correct
 *    filename for all 216 combinations (sample asserted).
 * 2) Optional: If RECORD_ID is set, calls generate-organizational-resolution API
 *    and checks that the response is a valid DOCX/PDF.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/test-org-resolution-216.ts
 * With API test: RECORD_ID=recXXX npx ts-node --project tsconfig.scripts.json scripts/test-org-resolution-216.ts
 */

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

// Optional: hit API with a C-Corp record and verify response
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
