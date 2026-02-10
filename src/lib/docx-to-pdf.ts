/**
 * Convert DOCX buffer to PDF via AWS Lambda only (no external APIs).
 * Uses LAMBDA_DOCX_TO_PDF_FUNCTION_NAME (default: docx-to-pdf-lambda) in LAMBDA_DOCX_TO_PDF_REGION (default: us-west-2).
 * Deploy the container image for reliable conversion: ./scripts/deploy-docx-to-pdf-lambda-container.sh
 */

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const FUNCTION_NAME = process.env.LAMBDA_DOCX_TO_PDF_FUNCTION_NAME?.trim() || 'docx-to-pdf-lambda';
const REGION = process.env.LAMBDA_DOCX_TO_PDF_REGION?.trim() || 'us-west-2';

function getLambdaClient(): LambdaClient | null {
  const key = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!key || !secret) return null;
  return new LambdaClient({
    region: REGION,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  });
}

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer | null> {
  const client = getLambdaClient();
  if (!client) return null;
  const payload = JSON.stringify({ docx_base64: docxBuffer.toString('base64') });
  const response = await client.send(new InvokeCommand({
    FunctionName: FUNCTION_NAME,
    Payload: new TextEncoder().encode(payload),
    InvocationType: 'RequestResponse',
  }));
  if (response.FunctionError) {
    const err = response.Payload ? new TextDecoder().decode(response.Payload) : response.FunctionError;
    throw new Error(`Lambda: ${response.FunctionError} ${err}`);
  }
  if (!response.Payload || response.Payload.length === 0) throw new Error('Lambda empty payload');
  const payloadBytes = response.Payload instanceof Uint8Array ? response.Payload : Buffer.from(response.Payload);
  const raw = JSON.parse(new TextDecoder().decode(payloadBytes)) as { statusCode?: number; body?: string };
  if (raw.statusCode && raw.statusCode !== 200) {
    const errBody = raw.body ? JSON.parse(raw.body) : raw;
    throw new Error(errBody?.error || raw.body || `Lambda ${raw.statusCode}`);
  }
  const body = raw.body ? JSON.parse(raw.body) : raw;
  const pdfB64 = body?.pdf_base64;
  if (!pdfB64) throw new Error('Lambda no pdf_base64');
  return Buffer.from(pdfB64, 'base64');
}

export function isDocxToPdfAvailable(): boolean {
  return !!getLambdaClient();
}
