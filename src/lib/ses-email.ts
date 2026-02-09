/**
 * Send an email via AWS SES with an optional PDF attachment (raw MIME).
 * Use this when the client should receive the document as an attachment.
 */

import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const CRLF = '\r\n';

/**
 * Build a MIME multipart/mixed message (HTML body + PDF attachment) and send via SES.
 */
export async function sendEmailWithPdfAttachment(params: {
  from: string;
  to: string[];
  subject: string;
  htmlBody: string;
  pdfBuffer: Buffer;
  pdfFileName: string;
}): Promise<void> {
  const { from, to, subject, htmlBody, pdfBuffer, pdfFileName } = params;
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const attachmentB64 = pdfBuffer.toString('base64');
  const lines: string[] = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}`,
    `Content-Disposition: attachment; filename="${pdfFileName.replace(/"/g, '')}"`,
    'Content-Type: application/pdf',
    'Content-Transfer-Encoding: base64',
    '',
    attachmentB64.replace(/(.{76})/g, `$1${CRLF}`),
    '',
    `--${boundary}--`,
  ];

  const rawMessage = lines.join(CRLF);
  const command = new SendRawEmailCommand({
    RawMessage: {
      Data: Buffer.from(rawMessage, 'utf-8'),
    },
  });

  await sesClient.send(command);
}

export interface EmailAttachment {
  filename: string;
  buffer: Buffer;
  contentType: string;
}

/**
 * Send an email with multiple attachments (e.g. multiple PDFs).
 */
export async function sendEmailWithMultipleAttachments(params: {
  from: string;
  to: string[];
  subject: string;
  htmlBody: string;
  attachments: EmailAttachment[];
}): Promise<void> {
  const { from, to, subject, htmlBody, attachments } = params;
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const lines: string[] = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
  ];

  for (const att of attachments) {
    const safeName = att.filename.replace(/"/g, '');
    const b64 = att.buffer.toString('base64');
    lines.push(
      `--${boundary}`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      `Content-Type: ${att.contentType}`,
      'Content-Transfer-Encoding: base64',
      '',
      b64.replace(/(.{76})/g, `$1${CRLF}`),
      ''
    );
  }
  lines.push(`--${boundary}--`);

  const rawMessage = lines.join(CRLF);
  const command = new SendRawEmailCommand({
    RawMessage: { Data: Buffer.from(rawMessage, 'utf-8') },
  });
  await sesClient.send(command);
}
