/**
 * Regenerate formation docs for a company, then email the client with all document links and PDF attachments.
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/send-company-documents-email.ts "E2E Format Verify Florida"
 *
 * Requires: .env.local with AIRTABLE_*, AWS_*, S3_DOCUMENTS_BUCKET, NEXT_PUBLIC_BASE_URL
 */

import * as fs from 'fs';
import * as path from 'path';
import Airtable from 'airtable';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getUserCompanyDocuments } from '../src/lib/dynamo';
import { sendEmailWithMultipleAttachments } from '../src/lib/ses-email';

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

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';
const S3_BUCKET = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
const DASHBOARD_URL = `${BASE_URL}/client/documents`;

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function findRecord(query: string): Promise<{ recordId: string; companyName: string; customerEmail: string }> {
  const normalizedQuery = query.toLowerCase().trim().replace(/"/g, '""');
  const records = await new Promise((resolve, reject) => {
    base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `OR(FIND("${normalizedQuery}", LOWER({Company Name})), FIND("${normalizedQuery}", LOWER({Customer Email})))`,
        maxRecords: 5,
      })
      .firstPage((err, recs) => (err ? reject(err) : resolve(recs ? [...recs] : [])));
  }) as any[];
  if (!records.length) throw new Error(`No Airtable record found for: ${query}`);
  const first = records[0];
  const fields = first.fields as Record<string, unknown>;
  return {
    recordId: first.id,
    companyName: (fields['Company Name'] as string) || 'Company',
    customerEmail: ((fields['Customer Email'] as string) || '').toLowerCase().trim(),
  };
}

async function downloadFromS3(s3Key: string): Promise<Buffer> {
  const res = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of (res.Body as any)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function getExtension(s3Key: string): string {
  const m = s3Key.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'pdf';
}

function contentType(ext: string): string {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

async function regenerateFormationDocs(recordId: string): Promise<void> {
  console.log('Regenerating Membership Registry and Organizational Resolution...');
  const mrRes = await fetch(`${BASE_URL}/api/airtable/generate-membership-registry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, updateAirtable: true }),
  });
  if (!mrRes.ok) {
    const err = await mrRes.json().catch(() => ({}));
    throw new Error(`Membership Registry: ${(err as any).error || mrRes.statusText}`);
  }
  console.log('Membership Registry: OK');

  const orRes = await fetch(`${BASE_URL}/api/airtable/generate-organizational-resolution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, updateAirtable: true }),
  });
  if (!orRes.ok) {
    const err = await orRes.json().catch(() => ({}));
    throw new Error(`Organizational Resolution: ${(err as any).error || orRes.statusText}`);
  }
  console.log('Organizational Resolution: OK');
}

async function main() {
  const query = process.argv[2] || 'E2E Format Verify Florida';
  console.log('Company query:', query);

  const { recordId, companyName, customerEmail } = await findRecord(query);
  if (!customerEmail) {
    throw new Error('Record has no Customer Email');
  }
  console.log('Record:', recordId, companyName, customerEmail);

  await regenerateFormationDocs(recordId);

  const documents = await getUserCompanyDocuments(customerEmail, recordId);
  const docsWithKeys = documents.filter((d) => d.s3Key || d.signedS3Key);
  if (!docsWithKeys.length) {
    throw new Error('No documents found for this company');
  }

  const viewLinks: string[] = [];
  const attachments: { filename: string; buffer: Buffer; contentType: string }[] = [];

  for (const doc of docsWithKeys) {
    const key = doc.signedS3Key || doc.s3Key;
    const viewUrl = `${BASE_URL}/api/documents/view?key=${encodeURIComponent(key)}`;
    const name = doc.name || doc.id || 'Document';
    viewLinks.push(`<li><a href="${viewUrl}">${name}</a></li>`);

    try {
      const buffer = await downloadFromS3(key);
      const ext = getExtension(key);
      const safeName = (name.replace(/[^\w\s\-\.]/g, '') || 'document').trim() + '.' + ext;
      attachments.push({ filename: safeName, buffer, contentType: contentType(ext) });
    } catch (e) {
      console.warn('Could not download attachment for', name, (e as Error).message);
    }
  }

  const subject = `Documentos de formación – ${companyName}`;
  const htmlBody = `
    <h2>Documentos para firmar / revisar</h2>
    <p>Hola,</p>
    <p>Adjuntamos los documentos de formación para <strong>${companyName}</strong>. También puedes verlos y descargarlos desde tu dashboard.</p>
    <p><strong>Enlaces a cada documento:</strong></p>
    <ul>
      ${viewLinks.join('')}
    </ul>
    <p><strong>Dashboard (todos los documentos):</strong><br/><a href="${DASHBOARD_URL}">${DASHBOARD_URL}</a></p>
    <p>Los documentos adjuntos están en este correo. Revisa y firma según corresponda.</p>
    <p>— Avenida Legal</p>
  `;

  await sendEmailWithMultipleAttachments({
    from: 'avenidalegal.2024@gmail.com',
    to: [customerEmail],
    subject,
    htmlBody,
    attachments,
  });

  console.log('Email sent to', customerEmail, 'with', attachments.length, 'attachments');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
