/**
 * Send a test email to a given address (SES, from Avenida Legal).
 * Uses the same format as the signed-document client notification.
 *
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/send-test-email.ts neotransmedia@gmail.com
 */

import * as fs from 'fs';
import * as path from 'path';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

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

const toEmail = process.argv[2] || 'neotransmedia@gmail.com';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
const dashboardUrl = `${baseUrl}/client/documents?tab=firmado`;

async function main() {
  const subject = `✅ [Prueba] Documento firmado disponible: SS-4`;
  const body = `
    <h2>Documento firmado subido por Avenida Legal</h2>
    <p>Hemos subido el documento firmado <strong>SS-4 (Solicitud de EIN)</strong> para <strong>Mi Empresa Test</strong>.</p>
    <p>Puedes verlo y descargarlo en la sección <strong>Completado</strong> de tu dashboard:</p>
    <p><a href="${dashboardUrl}">Abrir mi dashboard → Completado</a></p>
    <p><strong>Este es un correo de prueba.</strong> En un envío real incluiríamos también un enlace directo de descarga (PDF) que expira en 7 días.</p>
    <p style="color:#555;">Avenida Legal</p>
  `;

  const command = new SendEmailCommand({
    Source: 'avenidalegal.2024@gmail.com',
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: body } },
    },
  });

  await sesClient.send(command);
  console.log(`📧 Test email sent to ${toEmail}`);
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
