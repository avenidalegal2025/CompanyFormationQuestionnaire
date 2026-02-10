/**
 * QA: Verify DOCX → PDF conversion.
 * - Invokes docx-to-pdf Lambda with a test DOCX and checks for valid PDF.
 * - If CONVERTAPI_SECRET is set, runs the app's convertDocxToPdf (Lambda then ConvertAPI fallback) and expects PDF.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/qa-docx-to-pdf.ts
 *
 * Requires .env.local with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
 * For full pass (when Lambda fails): set CONVERTAPI_SECRET in .env.local.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  });
}

async function main() {
  const docxPath = path.join(__dirname, '..', 'organizational-resolution-inc-template.docx');
  if (!fs.existsSync(docxPath)) {
    console.error('Missing test DOCX:', docxPath);
    process.exit(1);
  }
  const docxBuffer = fs.readFileSync(docxPath);

  console.log('QA: DOCX → PDF conversion\n');

  // 1) App path (convertDocxToPdf: Lambda then ConvertAPI fallback)
  const { convertDocxToPdf } = await import('../src/lib/docx-to-pdf');
  let appPdf: Buffer | null = null;
  try {
    appPdf = await convertDocxToPdf(docxBuffer);
  } catch (e: any) {
    console.log('App convertDocxToPdf threw:', e?.message || e);
  }
  const appOk = appPdf && appPdf.length >= 100 && appPdf[0] === 0x25 && appPdf[1] === 0x50;
  if (appOk) {
    const out = path.join(__dirname, '..', 'qa-docx-to-pdf-out.pdf');
    fs.writeFileSync(out, appPdf!);
    console.log('PASS: App conversion returned valid PDF (' + appPdf!.length + ' bytes) -> ' + out);
    process.exit(0);
  }

  // 2) Direct Lambda invoke (for clarity when app path uses ConvertAPI)
  const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
  const client = new LambdaClient({
    region: process.env.LAMBDA_DOCX_TO_PDF_REGION || 'us-west-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  const payload = JSON.stringify({ docx_base64: docxBuffer.toString('base64') });
  const res = await client.send(
    new InvokeCommand({
      FunctionName: process.env.LAMBDA_DOCX_TO_PDF_FUNCTION_NAME || 'docx-to-pdf-lambda',
      Payload: new TextEncoder().encode(payload),
      InvocationType: 'RequestResponse',
    })
  );
  const rawStr = Buffer.from(res.Payload!).toString('utf8');
  const raw = JSON.parse(rawStr) as { statusCode?: number; body?: string };
  const body = raw.body ? JSON.parse(raw.body) : raw;
  const lambdaPdfB64 = body?.pdf_base64;
  const lambdaOk =
    raw.statusCode === 200 &&
    lambdaPdfB64 &&
    Buffer.from(lambdaPdfB64, 'base64').length >= 100 &&
    Buffer.from(lambdaPdfB64, 'base64')[0] === 0x25;

  if (lambdaOk) {
    console.log('PASS: Lambda returned valid PDF');
    process.exit(0);
  }

  console.log(
    'Lambda result: statusCode=' +
      raw.statusCode +
      ' error=' +
      (body?.error || '') +
      (body?.stderr ? ' stderr=' + String(body.stderr).slice(0, 100) : '')
  );
  console.log(
    '\nQA result: Lambda conversion fails with current LibreOffice layer (NoSuchElementException).'
  );
  console.log(
    'To get PDF conversion working: set CONVERTAPI_SECRET in .env.local (and Vercel), then re-run this script.'
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
