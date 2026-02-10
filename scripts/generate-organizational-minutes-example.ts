/**
 * Generate an example Organizational Minutes (C-Corp) document and save to Desktop.
 * Uses sample data: 1 shareholder (100%, 1,000 shares), 1 officer (President; Director).
 * Requires: LAMBDA_ORGANIZATIONAL_RESOLUTION_URL (e.g. from .env.local).
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/generate-organizational-minutes-example.ts
 *
 * Loads .env.local for LAMBDA_ORGANIZATIONAL_RESOLUTION_URL, TEMPLATE_BUCKET, etc.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
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
  // ignore
}

const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET || 'company-formation-template-llc-and-inc';
const AWS_REGION = process.env.AWS_REGION || 'us-west-1';
const TEMPLATE_BASE_URL = `https://${TEMPLATE_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;
const LAMBDA_URL = process.env.LAMBDA_ORGANIZATIONAL_RESOLUTION_URL || '';

// Sample C-Corp data: 1 shareholder (100%, 1,000 shares), 1 officer with title (Airtable: Owner 1 + Officer 1 Role)
const SAMPLE_FORM_DATA = {
  companyName: 'Example Corp Inc',
  companyAddress: '123 Main Street\nMiami, FL 33101',
  formationState: 'Florida',
  // Raw payment/formation date so Lambda can format IN WITNESS clause like other docs
  formationDate: '2026-02-10',
  paymentDateRaw: '2026-02-10',
  totalShares: 1000,
  members: [
    {
      name: 'Jane Doe',
      address: '456 Oak Ave, Miami, FL 33139',
      ownershipPercent: 100,
      shares: 1000,
    },
  ],
  managers: [
    {
      name: 'Jane Doe',
      address: '456 Oak Ave, Miami, FL 33139',
      role: 'President; Director',
    },
  ],
  memberCount: 1,
  managerCount: 1,
};

async function generateViaLambda(): Promise<Buffer> {
  if (!LAMBDA_URL) {
    throw new Error('Set LAMBDA_ORGANIZATIONAL_RESOLUTION_URL in .env.local to generate the example');
  }
  const templateUrl = `${TEMPLATE_BASE_URL}/templates/organizational-resolution-inc/organizational-minutes-inc-1.docx`;
  const payload = {
    form_data: SAMPLE_FORM_DATA,
    s3_bucket: process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents',
    s3_key: 'examples/organizational-minutes-example.docx',
    templateUrl,
    return_docx: true,
  };
  const res = await fetch(LAMBDA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lambda ${res.status}: ${text.slice(0, 400)}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = (await res.json()) as { docx_base64?: string };
    if (!json.docx_base64) throw new Error('Lambda response missing docx_base64');
    return Buffer.from(json.docx_base64, 'base64');
  }
  // For non-JSON responses, assume Lambda Function URL is returning raw DOCX bytes
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function getDesktopPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, 'Desktop') || home;
}

function getDocumentsPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, 'Documents') || home;
}

async function main() {
  console.log('Generating Organizational Minutes example (C-Corp)...');
  console.log('Sample data:');
  console.log('  Company:', SAMPLE_FORM_DATA.companyName);
  console.log('  Shareholder:', SAMPLE_FORM_DATA.members[0].name, '| 1,000 shares (100%)');
  console.log('  Officer:', SAMPLE_FORM_DATA.managers[0].name, '|', SAMPLE_FORM_DATA.managers[0].role);
  const buffer = await generateViaLambda();
  // Save to Documents with company name + document type + unique number for verification
  const docsDir = getDocumentsPath();
  const unique = process.env.EXAMPLE_SUFFIX || 'SigLineFix-9';
  const outPath = path.join(
    docsDir,
    `${SAMPLE_FORM_DATA.companyName} - Organizational Minutes - ${unique}.docx`
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log('Saved to', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
