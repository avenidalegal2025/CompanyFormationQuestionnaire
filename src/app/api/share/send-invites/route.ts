import { NextRequest, NextResponse } from 'next/server';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function POST(request: NextRequest) {
  try {
    const { emails, magicLink, inviterName = 'Un socio' } = await request.json();
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'Valid email list is required' }, { status: 400 });
    }

    if (!magicLink) {
      return NextResponse.json({ error: 'Magic link is required' }, { status: 400 });
    }

    const results = [];

    for (const email of emails) {
      try {
        const command = new SendEmailCommand({
          Source: process.env.FROM_EMAIL || 'noreply@avenidalegal.com',
          Destination: {
            ToAddresses: [email],
          },
          Message: {
            Subject: {
              Data: 'Invitación a colaborar en el cuestionario de formación de empresa',
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Invitación a colaborar</h2>
                    <p>Hola,</p>
                    <p>${inviterName} te ha invitado a colaborar en el cuestionario de formación de empresa.</p>
                    <p>Puedes acceder al cuestionario haciendo clic en el siguiente enlace:</p>
                    <div style="margin: 20px 0;">
                      <a href="${magicLink}" 
                         style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                        Acceder al cuestionario
                      </a>
                    </div>
                    <p>Este enlace expirará en 7 días por seguridad.</p>
                    <p>Si no esperabas esta invitación, puedes ignorar este email.</p>
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px;">
                      Este es un email automático, por favor no respondas directamente.
                    </p>
                  </div>
                `,
                Charset: 'UTF-8',
              },
              Text: {
                Data: `
Invitación a colaborar

Hola,

${inviterName} te ha invitado a colaborar en el cuestionario de formación de empresa.

Puedes acceder al cuestionario en: ${magicLink}

Este enlace expirará en 7 días por seguridad.

Si no esperabas esta invitación, puedes ignorar este email.

---
Este es un email automático, por favor no respondas directamente.
                `,
                Charset: 'UTF-8',
              },
            },
          },
        });

        await sesClient.send(command);
        results.push({ email, status: 'success' });
      } catch (error) {
        console.error(`Error sending email to ${email}:`, error);
        results.push({ 
          email, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      success: true,
      message: `Invitaciones enviadas: ${successCount} exitosas, ${errorCount} con error`,
      results
    });

  } catch (error) {
    console.error('Error sending invites:', error);
    return NextResponse.json(
      { error: 'Failed to send invites' }, 
      { status: 500 }
    );
  }
}
