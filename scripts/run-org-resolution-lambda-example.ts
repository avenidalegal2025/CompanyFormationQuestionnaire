/**
 * Run the Organizational Resolution Lambda with sample C-Corp data (216 template)
 * and save the filled DOCX to Desktop.
 *
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/run-org-resolution-lambda-example.ts
 */

import * as fs from 'fs';
import * as path from 'path';

try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  }
} catch {}

const BUCKET = process.env.TEMPLATE_BUCKET || 'company-formation-template-llc-and-inc';
const REGION = process.env.AWS_REGION || 'us-west-1';
const BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
const LAMBDA_URL = process.env.LAMBDA_ORGANIZATIONAL_RESOLUTION_URL || '';

// 2 shareholders, 2 directors, 2 officers -> Org_Resolution_2 Owners_2 Directors_2 Officers.docx
const FORM_DATA = {
  companyName: 'Sunset Blvd LLC',
  companyAddress: '9000 Sunset Boulevard\nLos Angeles, CA 90069',
  formationState: 'California',
  formationDate: 'seventh day of February, 2026',
  paymentDateRaw: '2026-02-07',
  totalShares: 1000,
  members: [
    { name: 'Alice Garcia', address: '100 Wilshire Blvd, Los Angeles, CA 90017', ownershipPercent: 60, shares: 600 },
    { name: 'Bob Martinez', address: '200 Santa Monica Blvd, Santa Monica, CA 90401', ownershipPercent: 40, shares: 400 },
  ],
  managers: [
    { name: 'Alice Garcia', address: '100 Wilshire Blvd, Los Angeles, CA 90017', role: 'President' },
    { name: 'Bob Martinez', address: '200 Santa Monica Blvd, Santa Monica, CA 90401', role: 'Secretary' },
  ],
  memberCount: 2,
  managerCount: 2,
  directorCount: 2,
};

const TEMPLATE_PATH = 'templates/organizational-resolution-inc-216/Org_Resolution_2 Owners_2 Directors_2 Officers.docx';

async function main() {
  if (!LAMBDA_URL) {
    console.error('Set LAMBDA_ORGANIZATIONAL_RESOLUTION_URL in .env.local');
    process.exit(1);
  }
  console.log('Calling Lambda with sample C-Corp data (2 shareholders, 2 directors, 2 officers)...');
  console.log('Template:', TEMPLATE_PATH);
  const payload = {
    form_data: FORM_DATA,
    s3_bucket: process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents',
    s3_key: 'examples/org-resolution-lambda-example.docx',
    templateUrl: `${BASE}/${TEMPLATE_PATH}`,
    return_docx: true,
  };
  const res = await fetch(LAMBDA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error('Lambda error:', res.status, await res.text());
    process.exit(1);
  }
  let buf: Buffer;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const json = (await res.json()) as { docx_base64?: string };
    if (!json.docx_base64) {
      console.error('Response missing docx_base64');
      process.exit(1);
    }
    buf = Buffer.from(json.docx_base64, 'base64');
  } else {
    buf = Buffer.from(await res.arrayBuffer());
  }
  const desktop = path.join(process.env.HOME || '', 'Desktop');
  const outPath = path.join(desktop, 'Org_Resolution_Example_Filled.docx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log('Saved:', outPath);
  console.log('Size:', buf.length, 'bytes');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
