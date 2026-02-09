import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Airtable from 'airtable';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getUserCompanyDocuments } from '@/lib/dynamo';
import { sendEmailWithMultipleAttachments } from '@/lib/ses-email';

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

const AUTHORIZED_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

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

/**
 * POST /api/admin/send-company-documents-email
 * Regenerates Membership Registry + Organizational Resolution, then emails the client
 * with all document view links and PDF/document attachments.
 * Body: { recordId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminEmail = session.user.email.toLowerCase().trim();
    if (!AUTHORIZED_EMAILS.some((e) => e.toLowerCase().trim() === adminEmail)) {
      return NextResponse.json({ error: 'Unauthorized', email: adminEmail }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const recordId = (body.recordId || '').trim();
    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const record = await base(AIRTABLE_TABLE_NAME).find(recordId);
    const fields = record.fields as Record<string, unknown>;
    const companyName = (fields['Company Name'] as string) || 'Company';
    const customerEmail = ((fields['Customer Email'] as string) || '').toLowerCase().trim();
    if (!customerEmail) {
      return NextResponse.json({ error: 'Record has no Customer Email' }, { status: 400 });
    }

    const entityType = (fields['Entity Type'] as string) || 'LLC';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    // Regenerate formation docs
    const isLLC = entityType === 'LLC' || (entityType || '').toLowerCase().includes('llc');
    if (isLLC) {
      await fetch(`${baseUrl}/api/airtable/generate-membership-registry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, updateAirtable: true }),
      });
    }
    await fetch(`${baseUrl}/api/airtable/generate-organizational-resolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId, updateAirtable: true }),
    });

    const documents = await getUserCompanyDocuments(customerEmail, recordId);
    const docsWithKeys = documents.filter((d) => d.s3Key || d.signedS3Key);
    if (!docsWithKeys.length) {
      return NextResponse.json({ error: 'No documents found for this company' }, { status: 404 });
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
      <ul>${viewLinks.join('')}</ul>
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

    return NextResponse.json({
      success: true,
      message: 'Documents regenerated and email sent',
      customerEmail,
      attachmentsCount: attachments.length,
    });
  } catch (error: any) {
    console.error('❌ send-company-documents-email error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
