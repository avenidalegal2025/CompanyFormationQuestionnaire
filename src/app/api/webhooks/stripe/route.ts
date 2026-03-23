import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { saveDomainRegistration, type DomainRegistration, saveBusinessPhone, saveGoogleWorkspace, type GoogleWorkspaceRecord, saveUserCompanyDocuments, type DocumentRecord, saveVaultMetadata, type VaultMetadata, getFormData, addUserCompanyDocument } from '@/lib/dynamo';
import { formatCompanyDocumentTitle, formatCompanyFileName } from '@/lib/document-names';
import { createVaultStructure, copyTemplateToVault, getFormDataSnapshot } from '@/lib/s3-vault';
import { createFormationRecord, mapQuestionnaireToAirtable, findFormationByStripeId } from '@/lib/airtable';
import { generate2848PDF, generate8821PDF } from '@/lib/pdf-filler';
import { mapFormToDocgenAnswers } from '@/lib/agreement-mapper';
import { generateDocument } from '@/lib/agreement-docgen';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { sendEmailWithMultipleAttachments, sendHtmlEmail } from '@/lib/ses-email';

// Send notification email for new company formations
async function sendNewCompanyNotification(
  companyName: string,
  customerEmail: string,
  entityType: string,
  state: string,
  airtableRecordId?: string,
  invoiceUrl?: string,
) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
    const screenshotsUrl = `${baseUrl}/admin/screenshots?company=${encodeURIComponent(companyName)}`;
    // Link directly to the admin documents panel with a search query for the company
    const adminDocsUrl = `${baseUrl}/admin/documents`;

    const invoiceRow = invoiceUrl
      ? `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Factura:</strong></td><td style="padding: 8px; border: 1px solid #ddd;"><a href="${invoiceUrl}">Ver comprobante de pago</a></td></tr>`
      : '';

    await sendHtmlEmail({
      from: 'avenidalegal.2024@gmail.com',
      to: ['avenidalegal.2024@gmail.com'],
      subject: `🏢 Nueva Empresa: ${companyName} - Requiere Aprobación`,
      htmlBody: `
        <h2>Nueva Empresa Registrada</h2>
        <p>Se ha registrado una nueva empresa que requiere aprobación para el auto-filing:</p>
        <table style="border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Empresa:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${companyName}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tipo:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${entityType}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Estado:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${state}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Cliente:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${customerEmail}</td></tr>
          ${invoiceRow}
        </table>
        <p><strong>Acción Requerida:</strong></p>
        <ol>
          <li>Revisar los documentos de la empresa en el <a href="${adminDocsUrl}">Panel de Abogado</a></li>
          <li>Si todo está correcto, cambiar la columna <strong>Autofill</strong> a <strong>"Yes"</strong> en Airtable</li>
          <li>El sistema automáticamente llenará el formulario de Sunbiz</li>
          <li>Las capturas de pantalla estarán disponibles en: <a href="${screenshotsUrl}">Ver Screenshots</a></li>
        </ol>
        <p style="margin-top: 20px;">
          <a href="${adminDocsUrl}" style="background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">Ver Empresa en Panel</a>
          <a href="${screenshotsUrl}" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">Ver Screenshots</a>
          ${invoiceUrl ? `<a href="${invoiceUrl}" style="background: #6c63ff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ver Factura</a>` : ''}
        </p>
      `,
    });
    console.log(`📧 Notification email sent for ${companyName}`);
  } catch (error) {
    console.error('❌ Failed to send notification email:', error);
    // Don't fail the webhook if email fails
  }
}

const S3_BUCKET = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/** Send client one email with all formation document links + PDF/file attachments (so they can download and sign). */
async function sendClientDocumentsEmail(
  companyName: string,
  customerEmail: string,
  documents: DocumentRecord[],
  invoiceUrl?: string,
) {
  const docsWithKeys = documents.filter((d) => d.s3Key || d.signedS3Key);
  if (!docsWithKeys.length) return;

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
  const DASHBOARD_URL = `${BASE_URL}/client/documents`;

  const viewLinks: string[] = [];
  const attachments: { filename: string; buffer: Buffer; contentType: string }[] = [];

  for (const doc of docsWithKeys) {
    const key = doc.signedS3Key || doc.s3Key;
    const viewUrl = `${BASE_URL}/api/documents/view?key=${encodeURIComponent(key)}`;
    const name = doc.name || doc.id || 'Document';
    viewLinks.push(`<li><a href="${viewUrl}">${name}</a></li>`);

    try {
      const res = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      const chunks: Uint8Array[] = [];
      for await (const chunk of (res.Body as any)) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      const ext = key.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() || 'pdf';
      const safeName = (name.replace(/[^\w\s\-\.]/g, '') || 'document').trim() + '.' + ext;
      const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream';
      attachments.push({ filename: safeName, buffer, contentType });
    } catch (e) {
      console.warn('Could not attach', name, (e as Error).message);
    }
  }

  if (attachments.length === 0) return;

  const subject = `Documentos de formación – ${companyName}`;
  const invoiceSection = invoiceUrl
    ? `<p><strong>Factura / Invoice:</strong><br/><a href="${invoiceUrl}">Ver factura de pago</a></p>`
    : '';
  const htmlBody = `
    <h2>Documentos para descargar y firmar</h2>
    <p>Hola,</p>
    <p>Tu pago ha sido confirmado. Adjuntamos los documentos de formación para <strong>${companyName}</strong>.</p>
    ${invoiceSection}
    <p><strong>Enlaces a cada documento:</strong></p>
    <ul>${viewLinks.join('')}</ul>
    <p><strong>Dashboard (ver todos):</strong><br/><a href="${DASHBOARD_URL}">${DASHBOARD_URL}</a></p>
    <p>Descarga los adjuntos, revísalos y fírmalos según corresponda. Puedes hacerlo aunque no entres al portal del cliente.</p>
    <p>— Avenida Legal</p>
  `;

  await sendEmailWithMultipleAttachments({
    from: 'avenidalegal.2024@gmail.com',
    to: [customerEmail],
    subject,
    htmlBody,
    attachments,
  });
  console.log(`📧 Client documents email sent to ${customerEmail} (${attachments.length} attachments)`);
}

// import { createWorkspaceAccount } from '@/lib/googleWorkspace'; // Temporarily disabled

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token-12345';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = (await headers()).get('stripe-signature');
  
  console.log('🔔 Webhook received - checking signature...');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout session completed:', session.id);
  
  if (session.metadata?.type === 'domain_purchase') {
    await handleDomainPurchase(session);
  } else if (session.metadata?.type === 'company_formation') {
    await handleCompanyFormation(session);
  } else if (session.metadata?.type === 'google_workspace_purchase') {
    await handleGoogleWorkspacePurchase(session);
  } else {
    console.log('Unknown payment type, skipping:', session.metadata?.type);
  }
}

async function handleDomainPurchase(session: Stripe.Checkout.Session) {
  const domains = JSON.parse(session.metadata?.domains || '[]');
  const customerEmail = session.customer_email || '';
  const customerName = session.metadata?.customer_name || '';
  const userId = session.metadata?.user_id || '';

  console.log('Processing domain purchase:', { domains, customerEmail, customerName, userId });

  // Register domains with Namecheap
  for (const domain of domains) {
    try {
      console.log(`🔄 Starting registration for domain: ${domain}`);
      const registrationResult = await registerDomain(domain, customerEmail, customerName, userId, session.id);
      console.log(`✅ Domain ${domain} registered successfully:`, registrationResult);
      
      // If domain registration was successful, trigger Google Workspace setup
      if (registrationResult.success && registrationResult.registered) {
        console.log(`🚀 Triggering Google Workspace setup for ${domain}`);
        
        try {
          const workspaceResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/domains/setup-workspace`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              domain: domain,
              userId: userId,
              customerEmail: customerEmail,
              customerName: customerName,
            }),
          });

          if (workspaceResponse.ok) {
            const workspaceResult = await workspaceResponse.json();
            console.log(`✅ Google Workspace setup initiated for ${domain}:`, workspaceResult);
          } else {
            console.error(`❌ Failed to setup Google Workspace for ${domain}`);
          }
        } catch (workspaceError) {
          console.error(`❌ Error setting up Google Workspace for ${domain}:`, workspaceError);
          // Don't fail the entire process if Workspace setup fails
        }
      }
    } catch (error) {
      console.error(`❌ Failed to register domain ${domain}:`, error);
      
      // Save failed status to DynamoDB
      try {
        await saveDomainRegistration(userId, {
          domain: domain,
          namecheapOrderId: `failed-${Date.now()}`,
          registrationDate: new Date().toISOString(),
          expiryDate: new Date().toISOString(),
          status: 'failed',
          stripePaymentId: session.id,
          price: 0,
          sslEnabled: false,
          googleWorkspaceStatus: 'none',
          nameservers: []
        });
        console.log(`💾 Saved failed status for domain ${domain}`);
      } catch (dbError) {
        console.error(`❌ Failed to save error status for ${domain}:`, dbError);
      }
      
      // Continue with other domains even if one fails
    }
  }
}

async function handleCompanyFormation(session: Stripe.Checkout.Session) {
  console.log('Processing company formation payment:', session.id);
  
  const entityType = session.metadata?.entityType || '';
  const state = session.metadata?.state || '';
  const hasUsAddress = session.metadata?.hasUsAddress === 'true';
  const hasUsPhone = session.metadata?.hasUsPhone === 'true';
  const skipAgreement = session.metadata?.skipAgreement === 'true';
  const totalAmount = parseFloat(session.metadata?.totalAmount || '0');
  const selectedServices = safeParseArray(session.metadata?.selectedServices);
  const forwardPhoneE164 = session.metadata?.forwardPhoneE164 || '';
  
  console.log('Company formation details:', {
    entityType,
    state,
    hasUsAddress,
    hasUsPhone,
    skipAgreement,
    totalAmount,
    selectedServices,
    forwardPhoneE164
  });
  
  // Get user ID (email) for vault creation and idempotency tracking — normalize so it matches /api/documents lookup
  const userId = (session.customer_details?.email || (session.customer_email as string) || '').toLowerCase().trim();
  const companyName = session.metadata?.companyName || 'Company';
  
  // Declare airtableRecordId at function scope so it's accessible for phone provisioning
  let airtableRecordId: string | null = null;
  
  if (!userId) {
    console.error('❌ No user email found, cannot create vault');
    return;
  }

  // Airtable-based idempotency: if this Stripe Payment ID already exists in the
  // Formations table, this is a retry and we MUST NOT create another company.
  try {
    const existing = await findFormationByStripeId(session.id);
    if (existing) {
      console.log('🔁 Stripe retry detected – Airtable formation already exists. Skipping duplicate creation.', {
        userId,
        stripePaymentId: session.id,
        airtableRecordId: existing.id,
      });
      return;
    }
  } catch (idempLookupError) {
    console.error('⚠️ Failed to check Airtable for existing Stripe Payment ID (continuing anyway):', idempLookupError);
  }

  // Create S3 vault and copy template documents
  try {
    console.log('📁 Creating document vault for:', companyName);
    
    // Step 1: Create vault structure (returns vaultPath like "trimaran-llc-abc123de")
    const vaultPath = await createVaultStructure(userId, companyName);
    
    // Step 2: Save vault metadata
    const vaultMetadata: VaultMetadata = {
      vaultPath,
      companyName,
      createdAt: new Date().toISOString(),
    };
    await saveVaultMetadata(userId, vaultMetadata);
    
    // Step 3: Copy template documents
    const documents: DocumentRecord[] = [];
    
    // Copy entity-specific registry documents
    if (entityType === 'LLC') {
      // LLC: Copy Membership Registry
      console.log('📄 Copying Membership Registry template...');
      try {
        const membershipFileName = formatCompanyFileName(companyName, 'Membership Registry', 'docx');
        const membershipResult = await copyTemplateToVault(
          vaultPath,
          'membership-registry-template.docx',
          `formation/${membershipFileName}`
        );
        documents.push({
          id: 'membership-registry',
          name: formatCompanyDocumentTitle(companyName, 'Membership Registry'),
          type: 'formation',
          s3Key: membershipResult.s3Key,
          status: 'template',
          createdAt: new Date().toISOString(),
        });
        console.log('✅ Membership Registry template copied');
      } catch (membershipError: any) {
        console.error('⚠️ Failed to copy Membership Registry template:', membershipError.message);
        console.log('⚠️ Continuing without Membership Registry template');
      }
    } else {
      // Corporation: Copy Shareholder Registry
      console.log('📄 Copying Shareholder Registry template...');
      try {
        const shareholderFileName = formatCompanyFileName(companyName, 'Shareholder Registry', 'docx');
        const shareholderResult = await copyTemplateToVault(
          vaultPath,
          'shareholder-registry-template.docx',
          `formation/${shareholderFileName}`
        );
        documents.push({
          id: 'shareholder-registry',
          name: formatCompanyDocumentTitle(companyName, 'Shareholder Registry'),
          type: 'formation',
          s3Key: shareholderResult.s3Key,
          status: 'template',
          createdAt: new Date().toISOString(),
        });
        console.log('✅ Shareholder Registry template copied');
      } catch (shareholderError: any) {
        console.error('⚠️ Failed to copy Shareholder Registry template:', shareholderError.message);
        console.log('⚠️ Continuing without Shareholder Registry template');
      }
      
      // Corporation: Copy Bylaws
      console.log('📄 Copying Bylaws template...');
      try {
        const bylawsFileName = formatCompanyFileName(companyName, 'Bylaws', 'docx');
        const bylawsResult = await copyTemplateToVault(
          vaultPath,
          'bylaws-template.docx',
          `formation/${bylawsFileName}`
        );
        documents.push({
          id: 'bylaws',
          name: formatCompanyDocumentTitle(companyName, 'Bylaws'),
          type: 'formation',
          s3Key: bylawsResult.s3Key,
          status: 'template',
          createdAt: new Date().toISOString(),
        });
        console.log('✅ Bylaws template copied');
      } catch (bylawsError: any) {
        console.error('⚠️ Failed to copy Bylaws template:', bylawsError.message);
        console.log('⚠️ Continuing without Bylaws template');
      }
    }
    
    // Always copy Organizational Resolution
    console.log('📄 Copying Organizational Resolution template...');
    const resolutionFileName = formatCompanyFileName(companyName, 'Organizational Resolution', 'docx');
    const resolutionResult = await copyTemplateToVault(
      vaultPath,
      'organizational-resolution-template.docx',
      `formation/${resolutionFileName}`
    );
    documents.push({
      id: 'organizational-resolution',
      name: formatCompanyDocumentTitle(companyName, 'Organizational Resolution'),
      type: 'formation',
      s3Key: resolutionResult.s3Key,
      status: 'template',
      createdAt: new Date().toISOString(),
    });
    
    // Copy Operating Agreement if purchased (and it's an LLC)
    const hasAgreement = (selectedServices || []).includes('operating_agreement') || 
                         (selectedServices || []).includes('shareholder_agreement');
    
    if (hasAgreement) {
      try {
        console.log(`📄 Copying ${entityType === 'LLC' ? 'Operating' : 'Shareholder'} Agreement template...`);
        const agreementTemplate = entityType === 'LLC' 
          ? 'operating-agreement-llc-template.docx'
          : 'shareholder-agreement-corp-template.docx';
        
        const agreementFileName = formatCompanyFileName(
          companyName,
          entityType === 'LLC' ? 'Operating Agreement' : 'Shareholder Agreement',
          'docx'
        );
        
        const agreementResult = await copyTemplateToVault(
          vaultPath,
          agreementTemplate,
          `agreements/${agreementFileName}`
        );
        
        documents.push({
          id: entityType === 'LLC' ? 'operating-agreement' : 'shareholder-agreement',
          name: formatCompanyDocumentTitle(
            companyName,
            entityType === 'LLC' ? 'Operating Agreement' : 'Shareholder Agreement'
          ),
          type: 'agreement',
          s3Key: agreementResult.s3Key,
          status: 'template',
          createdAt: new Date().toISOString(),
        });
        console.log(`✅ ${entityType === 'LLC' ? 'Operating' : 'Shareholder'} Agreement template copied`);
      } catch (agreementError: any) {
        console.error(`⚠️ Failed to copy ${entityType === 'LLC' ? 'Operating' : 'Shareholder'} Agreement template:`, agreementError.message);
        console.error(`⚠️ Template file may not exist: ${entityType === 'LLC' ? 'operating-agreement-llc-template.docx' : 'shareholder-agreement-corp-template.docx'}`);
        console.log('⚠️ Continuing without agreement template - it can be uploaded manually later');
        // Don't fail the entire process - continue without the agreement template
      }
    }
    
    // Step 4: Get form data from DynamoDB (needed for PDF generation and Airtable sync)
    const formDataUserId = session.metadata?.userId || session.customer_details?.email || (session.customer_email as string) || '';
    console.log('🔍 Looking up formData for userId:', formDataUserId);
    
    let formData = formDataUserId ? await getFormData(formDataUserId) : null;
    
    if (!formData) {
      console.error('❌ No form data found in DynamoDB for user:', formDataUserId);
      console.log('🔄 Attempting to load form data snapshot from S3 using session ID:', session.id);
      formData = await getFormDataSnapshot(session.id);
      if (formData) {
        console.log('✅ Loaded form data snapshot from S3');
    } else {
      console.error('❌ No form data snapshot found for session:', session.id);
      console.error('❌ Cannot generate PDFs or sync to Airtable without form data');
      console.log('⚠️ Continuing without PDF generation and Airtable sync');
      }
    }

    // Log formData status before PDF generation
    if (!formData) {
      console.error('🚨 CRITICAL: formData is null/undefined - PDF generation will be SKIPPED');
      console.error('🚨 This means no tax forms (SS-4, 2848, 8821) will be generated');
      console.error('🚨 Check logs above for formData retrieval errors');
    }

    if (formData) {
      console.log('✅ FormData retrieved successfully');
      console.log('📋 FormData structure:', {
        hasCompany: !!formData.company,
        hasOwners: !!formData.owners,
        hasAdmin: !!formData.admin,
        hasAgreement: !!formData.agreement,
        entityType: formData.company?.entityType,
        ownersCount: formData.owners?.length,
        managersCount: formData.admin?.managersCount,
      });
      
      // Step 5: Generate tax forms (2848, 8821) - NOTE: SS-4 is generated from Airtable in Step 8
      try {
        console.log('📄 Generating tax forms (2848, 8821)...');
        console.log('📋 FormData for PDF generation:', {
          companyName: formData.company?.companyName,
          entityType: formData.company?.entityType,
          ownersCount: formData.owners?.length,
          hasAgreement: !!formData.agreement,
        });
        console.log('📁 Vault path:', vaultPath);
        console.log('🏢 Company name:', companyName);
        console.log('🔗 Lambda URLs configured:', {
          form2848: !!process.env.LAMBDA_2848_URL,
          form8821: !!process.env.LAMBDA_8821_URL,
        });
        console.log('ℹ️ SS-4 will be generated from Airtable data in Step 8 (after Airtable record is created)');
        
        // Generate only 2848 and 8821 - SS-4 will be generated from Airtable
        const form2848Result = await generate2848PDF(vaultPath, companyName, formData);
        const form8821Result = await generate8821PDF(vaultPath, companyName, formData);
        
        const taxForms = {
          ss4: { success: false, error: 'SS-4 will be generated from Airtable in Step 8' },
          form2848: form2848Result,
          form8821: form8821Result,
        };
        
        console.log('📊 Tax forms generation results:', {
          ss4: { success: false, note: 'Will be generated from Airtable in Step 8' },
          form2848: { success: taxForms.form2848.success, error: taxForms.form2848.error, s3Key: taxForms.form2848.s3Key },
          form8821: { success: taxForms.form8821.success, error: taxForms.form8821.error, s3Key: taxForms.form8821.s3Key },
        });
        
        if (taxForms.form2848.success && taxForms.form2848.s3Key) {
          const doc = {
            id: 'form-2848-power-of-attorney',
            name: formatCompanyDocumentTitle(companyName, 'Form 2848 Power of Attorney'),
            type: 'tax' as const,
            s3Key: taxForms.form2848.s3Key,
            status: 'generated' as const,
            createdAt: new Date().toISOString(),
            size: taxForms.form2848.size,
          };
          documents.push(doc);
          console.log('✅ Form 2848 PDF added to documents array:', JSON.stringify(doc, null, 2));
        } else {
          console.error('❌ Form 2848 generation failed:', taxForms.form2848.error);
          console.error('❌ Form 2848 failure details:', JSON.stringify(taxForms.form2848, null, 2));
        }
        
        if (taxForms.form8821.success && taxForms.form8821.s3Key) {
          const doc = {
            id: 'form-8821-tax-authorization',
            name: formatCompanyDocumentTitle(companyName, 'Form 8821 Tax Information Authorization'),
            type: 'tax' as const,
            s3Key: taxForms.form8821.s3Key,
            status: 'generated' as const,
            createdAt: new Date().toISOString(),
            size: taxForms.form8821.size,
          };
          documents.push(doc);
          console.log('✅ Form 8821 PDF added to documents array:', JSON.stringify(doc, null, 2));
        } else {
          console.error('❌ Form 8821 generation failed:', taxForms.form8821.error);
          console.error('❌ Form 8821 failure details:', JSON.stringify(taxForms.form8821, null, 2));
        }
        
        const successCount = [taxForms.ss4, taxForms.form2848, taxForms.form8821].filter(r => r.success).length;
        console.log(`✅ Tax forms generation completed: ${successCount}/3 successful`);
        
        if (successCount === 0) {
          console.error('⚠️ WARNING: No tax forms were generated successfully!');
          console.error('⚠️ This may indicate Lambda function issues or data transformation problems');
          console.error('⚠️ Will attempt to generate SS-4 from Airtable in Step 8');
        }
        
        // Log SS-4 generation status specifically
        if (!taxForms.ss4.success) {
          console.error('❌ Initial SS-4 generation failed - will try Airtable-based generation');
          console.error('❌ SS-4 error:', taxForms.ss4.error);
        } else {
          console.log('✅ Initial SS-4 generation succeeded (will be replaced by Airtable-based generation)');
        }
      } catch (pdfError: any) {
        console.error('❌ Failed to generate tax forms:', pdfError.message);
        console.error('❌ PDF generation error stack:', pdfError.stack);
        console.error('❌ PDF generation error details:', JSON.stringify(pdfError, Object.getOwnPropertyNames(pdfError), 2));
        // Don't fail the entire process if PDF generation fails
      }
    }
    
    // Step 6: Sync to Airtable CRM (moved before document saving so we have airtableRecordId)
    // IMPORTANT: Always try to create Airtable record, even if formData is missing
    // This ensures the company appears in the dashboard
    try {
      console.log('📊 Syncing formation data to Airtable...');
      
      if (!formData) {
        console.warn('⚠️ WARNING: formData is missing, creating minimal Airtable record from Stripe session data');
        console.warn('⚠️ This means some fields will be empty, but the company will still be visible in the dashboard');
      }
      
      // Build document URLs (use signed versions when available, otherwise use original)
      // Prefer signedS3Key if it exists, otherwise fall back to s3Key
      const getDocumentKey = (docId: string) => {
        const doc = documents.find(d => d.id === docId);
        return doc?.signedS3Key || doc?.s3Key;
      };
      
      const documentUrls = {
        membershipRegistry: getDocumentKey('membership-registry'),
        organizationalResolution: getDocumentKey('organizational-resolution'),
        operatingAgreement: getDocumentKey('operating-agreement') || getDocumentKey('shareholder-agreement'),
        ss4: getDocumentKey('ss4-ein-application'),
        form2848: getDocumentKey('form-2848-power-of-attorney'),
        form8821: getDocumentKey('form-8821-tax-authorization'),
      };
      
      console.log('📋 Document URLs for Airtable:', {
        membershipRegistry: documentUrls.membershipRegistry || 'NOT FOUND',
        organizationalResolution: documentUrls.organizationalResolution || 'NOT FOUND',
        operatingAgreement: documentUrls.operatingAgreement || 'NOT FOUND',
        ss4: documentUrls.ss4 || 'NOT FOUND',
        form2848: documentUrls.form2848 || 'NOT FOUND',
        form8821: documentUrls.form8821 || 'NOT FOUND',
      });
      
      console.log('📋 All documents in array:', documents.map(d => ({ id: d.id, name: d.name, s3Key: d.s3Key })));
      
      // Map and create Airtable record
      // If formData is missing, mapQuestionnaireToAirtable will use Stripe session metadata as fallback
      const airtableRecord = mapQuestionnaireToAirtable(
        formData || {}, // Pass empty object if formData is null
        session,
        vaultPath,
        documentUrls
      );
      
      console.log('📊 Airtable record being created:', {
        'Company Name': airtableRecord['Company Name'],
        'Customer Email': airtableRecord['Customer Email'],
        'Entity Type': airtableRecord['Entity Type'],
        'Formation State': airtableRecord['Formation State'],
        'Stripe Payment ID': airtableRecord['Stripe Payment ID'],
      });
      
      console.log('📊 Airtable record tax form URLs:', {
        'SS-4 URL': airtableRecord['SS-4 URL'] || 'EMPTY',
        '2848 URL': airtableRecord['2848 URL'] || 'EMPTY',
        '8821 URL': airtableRecord['8821 URL'] || 'EMPTY',
      });
      
      console.log('📸 Filing Images URL:', airtableRecord['Filing Images'] || 'EMPTY');
      
      airtableRecordId = await createFormationRecord(airtableRecord);
      console.log(`✅ Airtable record created successfully: ${airtableRecordId}`);
      console.log(`✅ Company "${airtableRecord['Company Name']}" is now visible in the dashboard`);
      
      // Step 7: Save all document metadata to DynamoDB (AFTER Airtable record is created)
      // Now we can use the Airtable record ID as the company key
      // IMPORTANT: Failures here should NOT block the process – they only affect the client documents view.
      try {
        const companyKey = airtableRecordId || 'default';
        await saveUserCompanyDocuments(userId, companyKey, documents);
        console.log(`✅ Document vault saved to DynamoDB with ${documents.length} documents (companyId=${companyKey})`);
      } catch (docsError) {
        console.error('⚠️ Failed to save documents to DynamoDB (will continue anyway):', docsError);
      }
      
      // Step 8: Regenerate tax forms (SS-4, 2848, 8821) from Airtable data (after payment confirmation)
      // This ensures all forms use canonical Airtable data, especially owner information
      // IMPORTANT: Use absolute URL for internal API calls in Vercel
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                     (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
      
      // Helper function to regenerate a form from Airtable
      const regenerateFormFromAirtable = async (
        formId: string,
        formName: string,
        apiEndpoint: string
      ) => {
        try {
          console.log(`📄 Regenerating ${formName} from Airtable record (post-payment confirmation)...`);
          console.log(`📋 Airtable Record ID: ${airtableRecordId}`);
          console.log(`🔗 Calling ${formName} generation endpoint: ${apiEndpoint}`);
          
          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recordId: airtableRecordId,
              updateAirtable: true,
            }),
          });
          
          console.log(`📡 ${formName} generation API response status: ${response.status} ${response.statusText}`);
          
          if (response.ok) {
            const result = await response.json();
            console.log(`✅ ${formName} generated from Airtable successfully`);
            console.log(`📁 ${formName} S3 Key: ${result.s3Key}`);
            
            // Update the documents array with the regenerated form
            const existingIndex = documents.findIndex(d => d.id === formId);
            if (existingIndex >= 0 && result.s3Key) {
              // Replace existing form with the one from Airtable
              documents[existingIndex].s3Key = result.s3Key;
              documents[existingIndex].status = 'generated';
              if (result.pdfSize) {
                documents[existingIndex].size = result.pdfSize;
              }
              console.log(`✅ Updated ${formName} document in documents array (from Airtable)`);
            } else if (result.s3Key) {
              // Add form if it wasn't in the initial documents array
              documents.push({
                id: formId,
                name: formName,
                type: 'tax' as const,
                s3Key: result.s3Key,
                status: 'generated' as const,
                createdAt: new Date().toISOString(),
                size: result.pdfSize,
              });
              console.log(`✅ Added ${formName} document to documents array (from Airtable)`);
            }
            
            return { success: true, s3Key: result.s3Key };
          } else {
            const errorText = await response.text();
            console.error(`❌ Failed to generate ${formName} from Airtable: ${response.status}`);
            console.error(`❌ Error details: ${errorText}`);
            return { success: false, error: errorText };
          }
        } catch (error: any) {
          console.error(`❌ Error generating ${formName} from Airtable:`, error.message);
          console.error(`❌ ${formName} generation error stack:`, error.stack);
          return { success: false, error: error.message };
        }
      };
      
      // Regenerate SS-4 from Airtable
      await regenerateFormFromAirtable(
        'ss4-ein-application',
        formatCompanyDocumentTitle(companyName, 'SS4'),
        `${baseUrl}/api/airtable/generate-ss4`
      );

      // NOTE: Org Resolution regeneration is handled below via regenerateFormFromAirtable
      // (which also updates the documents array for the email attachments)

      // Regenerate 2848 from Airtable
      await regenerateFormFromAirtable(
        'form-2848-power-of-attorney',
        formatCompanyDocumentTitle(companyName, 'Form 2848 Power of Attorney'),
        `${baseUrl}/api/airtable/generate-2848`
      );
      
      // Regenerate 8821 from Airtable
      await regenerateFormFromAirtable(
        'form-8821-tax-authorization',
        formatCompanyDocumentTitle(companyName, 'Form 8821 Tax Information Authorization'),
        `${baseUrl}/api/airtable/generate-8821`
      );
      
      // Regenerate Membership Registry from Airtable (for LLCs only)
      if (entityType === 'LLC') {
        await regenerateFormFromAirtable(
          'membership-registry',
          formatCompanyDocumentTitle(companyName, 'Membership Registry'),
          `${baseUrl}/api/airtable/generate-membership-registry`
        );
      }

      // Regenerate Organizational Resolution from Airtable (LLC + Corporations)
      if (entityType === 'LLC' || entityType === 'C-Corp' || entityType === 'S-Corp') {
        await regenerateFormFromAirtable(
          'organizational-resolution',
          formatCompanyDocumentTitle(companyName, 'Organizational Resolution'),
          `${baseUrl}/api/airtable/generate-organizational-resolution`
        );
      }

      // Regenerate Bylaws from Airtable (for corporations only)
      if (entityType === 'C-Corp' || entityType === 'S-Corp') {
        await regenerateFormFromAirtable(
          'shareholder-registry',
          formatCompanyDocumentTitle(companyName, 'Shareholder Registry'),
          `${baseUrl}/api/airtable/generate-shareholder-registry`
        );

        await regenerateFormFromAirtable(
          'bylaws',
          formatCompanyDocumentTitle(companyName, 'Bylaws'),
          `${baseUrl}/api/airtable/generate-bylaws`
        );
      }
      
      // Generate filled Operating/Shareholder Agreement (if purchased and form data has agreement answers)
      if (hasAgreement && formData?.agreement) {
        try {
          console.log(`📄 Generating filled ${entityType === 'LLC' ? 'Operating' : 'Shareholder'} Agreement...`);
          const answers = mapFormToDocgenAnswers(formData);
          const { buffer, filename } = await generateDocument(answers);

          const agreementFileName = formatCompanyFileName(
            companyName,
            entityType === 'LLC' ? 'Operating Agreement' : 'Shareholder Agreement',
            'docx'
          );
          const agreementS3Key = `${vaultPath}/agreements/${agreementFileName}`;

          await new S3Client({
            region: process.env.AWS_REGION || 'us-west-1',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
          }).send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: agreementS3Key,
            Body: buffer,
            ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }));

          // Update existing agreement doc in documents array (replaces blank template)
          const agreementDocId = entityType === 'LLC' ? 'operating-agreement' : 'shareholder-agreement';
          const existingIdx = documents.findIndex(d => d.id === agreementDocId);
          const agreementDoc: DocumentRecord = {
            id: agreementDocId,
            name: formatCompanyDocumentTitle(
              companyName,
              entityType === 'LLC' ? 'Operating Agreement' : 'Shareholder Agreement'
            ),
            type: 'agreement',
            s3Key: agreementS3Key,
            status: 'generated',
            createdAt: new Date().toISOString(),
          };
          if (existingIdx >= 0) {
            documents[existingIdx] = agreementDoc;
          } else {
            documents.push(agreementDoc);
          }
          console.log(`✅ ${entityType === 'LLC' ? 'Operating' : 'Shareholder'} Agreement generated and uploaded`);
        } catch (agreementGenError: any) {
          console.error(`⚠️ Failed to generate filled agreement:`, agreementGenError.message);
          console.log('⚠️ The blank template copy (if it succeeded earlier) will remain as fallback');
        }
      }

      // Update DynamoDB with all regenerated forms for this specific company
      try {
        const companyKeyForUpdate = airtableRecordId || 'default';
        await saveUserCompanyDocuments(userId, companyKeyForUpdate, documents);
        console.log('✅ Updated DynamoDB with all tax forms regenerated from Airtable (companyId=' + companyKeyForUpdate + ')');
      } catch (dbError) {
        console.error('⚠️ Failed to update DynamoDB with regenerated forms (continuing anyway):', dbError);
      }
      
      // Retrieve Stripe invoice URL (if invoice was created at checkout)
      let invoiceUrl: string | undefined;
      try {
        if (session.invoice) {
          const invoice = await stripe.invoices.retrieve(session.invoice as string);
          invoiceUrl = invoice.hosted_invoice_url || undefined;
          console.log(`🧾 Stripe invoice URL retrieved: ${invoiceUrl ? 'yes' : 'no'}`);
        } else {
          console.log('ℹ️ No Stripe invoice associated with this session');
        }
      } catch (invoiceErr: any) {
        console.error('⚠️ Failed to retrieve Stripe invoice:', invoiceErr?.message || invoiceErr);
      }

      // Send email notification for approval (internal — to the lawyer)
      await sendNewCompanyNotification(
        airtableRecord['Company Name'] || 'Unknown Company',
        airtableRecord['Customer Email'] || session.customer_details?.email || session.customer_email || 'unknown@email.com',
        airtableRecord['Entity Type'] || 'LLC',
        airtableRecord['Formation State'] || 'Florida',
        airtableRecordId || undefined,
        invoiceUrl,
      );

      // Send client one email with all document links + attachments (so they can download and sign right away)
      try {
        await sendClientDocumentsEmail(
          airtableRecord['Company Name'] || companyName,
          airtableRecord['Customer Email'] || userId,
          documents,
          invoiceUrl,
        );
      } catch (clientEmailErr: any) {
        console.error('❌ Failed to send client documents email:', clientEmailErr?.message || clientEmailErr);
      }
      
    } catch (airtableError: any) {
      console.error('❌ CRITICAL: Failed to sync to Airtable:', airtableError.message);
      console.error('❌ Airtable error stack:', airtableError.stack);
      console.error('❌ Airtable error details:', JSON.stringify(airtableError, null, 2));
      console.error('❌ This means the company will NOT appear in the client dashboard');
      console.error('❌ Company name:', session.metadata?.companyName || 'Unknown');
      console.error('❌ Customer email:', session.customer_details?.email || session.customer_email || 'Unknown');
      console.error('❌ Stripe Payment ID:', session.id);
      // IMPORTANT: Tag the error so the outer catch can distinguish it from vault errors.
      // Airtable failures are CRITICAL and must propagate so Stripe retries.
      airtableError._isAirtableCritical = true;
      throw airtableError;
    }

  } catch (outerError: any) {
    if (outerError._isAirtableCritical) {
      // CRITICAL: Airtable record creation failed. DO NOT swallow — propagate so
      // Stripe treats this attempt as failed and retries the webhook.
      console.error('❌ CRITICAL: Airtable error propagating to Stripe for retry');
      throw outerError;
    }
    // Non-critical: vault/S3 setup failed but we should still attempt Airtable creation.
    // Note: if we reach here, it means vault operations failed BEFORE the Airtable section,
    // so the Airtable record was never attempted. Log and continue — the sync-session
    // fallback from the success page will retry the entire flow.
    console.error('❌ Failed to create document vault:', outerError);
    console.error('⚠️ Airtable record may NOT have been created. sync-session fallback will retry.');
  }
  
  console.log('Company formation payment processed successfully');

  // Auto-provision phone if the package includes it (or user lacks US phone)
  try {
    const needsPhone = (selectedServices || []).includes('business_phone') || !hasUsPhone;
    if (needsPhone && state) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      if (!baseUrl) throw new Error('Missing NEXT_PUBLIC_BASE_URL');
      if (!forwardPhoneE164) {
        console.warn('No forwardPhoneE164 provided; skipping phone provisioning');
        return;
      }
      const resp = await fetch(`${baseUrl}/api/phone/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formationState: state, forwardToE164: forwardPhoneE164 })
      });
      if (resp.ok) {
        const data = await resp.json();
        console.log('📞 Phone provisioned:', data);
        const userKey = session.customer_details?.email || (session.customer_email as string) || '';
        if (userKey) {
          // Save to DynamoDB (for user-level phone management)
          await saveBusinessPhone(userKey, {
            phoneNumber: data.phoneNumber,
            areaCode: data.areaCode,
            sid: data.sid,
            forwardToE164: forwardPhoneE164,
            updatedAt: new Date().toISOString(),
          });
          
          // CRITICAL: Also save to Airtable's "Business Phone" field for this specific company
          // This ensures the SS4 form uses the correct phone number for this company
          if (airtableRecordId) {
            try {
              const { updateFormationRecord } = await import('@/lib/airtable');
              // Format phone number: Twilio returns E.164 format (+17866400626), we need to store it with area code
              // The phone number already includes area code in E.164 format
              await updateFormationRecord(airtableRecordId, {
                'Business Phone': data.phoneNumber, // E.164 format includes area code: +17866400626
              });
              console.log(`✅ Updated Airtable record ${airtableRecordId} with Business Phone: ${data.phoneNumber}`);
            } catch (updateError) {
              console.error('❌ Failed to update Airtable with Business Phone:', updateError);
            }
          } else {
            console.warn('⚠️ No airtableRecordId available to update with Business Phone');
          }
        }
      } else {
        console.error('❌ Failed to provision phone:', await resp.text());
      }
    }
  } catch (err) {
    console.error('Auto-provision phone error:', err);
  }

  // Auto-provision Google Workspace if the package includes it
  try {
    const needsWorkspace = (selectedServices || []).includes('google_workspace');
    if (needsWorkspace) {
      // Check if this is a test payment (Stripe test mode)
      const isTestMode = session.id.startsWith('cs_test_');
      
      if (isTestMode) {
        console.log('⚠️ TEST MODE: Skipping real Google Workspace provisioning');
        console.log('💡 In production, this would create a real Google Workspace account');
        
        // Save mock data for testing
        const customerEmail = session.customer_details?.email || (session.customer_email as string) || '';
        const mockWorkspaceRecord: GoogleWorkspaceRecord = {
          domain: 'test-company.com',
          customerId: 'mock-customer-id',
          adminEmail: 'admin@test-company.com',
          adminPassword: 'MockPassword123!',
          status: 'pending',
          setupDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          gmailEnabled: true,
          dnsConfigured: false,
          domainVerified: false,
          stripePaymentId: session.id,
          price: 15000,
        };
        
        if (customerEmail) {
          await saveGoogleWorkspace(customerEmail, mockWorkspaceRecord);
          console.log('✅ Mock Google Workspace data saved for testing');
        }
        return;
      }
      
      console.log('🚀 PRODUCTION MODE: Starting real Google Workspace provisioning...');
      
      const customerEmail = session.customer_details?.email || (session.customer_email as string) || '';
      const customerName = session.customer_details?.name || session.metadata?.customer_name || 'Customer';
      
      // Get the company name from metadata to create the domain
      // For now, we'll use a placeholder - in production, you'd get the actual domain from the user
      const companyName = session.metadata?.companyName || 'example';
      const domain = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      
      if (!customerEmail) {
        console.warn('No customer email provided; skipping Google Workspace provisioning');
        return;
      }

      // Temporarily disabled - Google Workspace integration
      console.warn('⚠️ Google Workspace provisioning temporarily disabled');
      return;

      // const workspaceAccount = await createWorkspaceAccount(domain, customerEmail, customerName);
      // console.log('✅ Google Workspace account created:', workspaceAccount.adminEmail);

      // // Save to DynamoDB
      // const userKey = customerEmail;
      // const workspaceRecord: GoogleWorkspaceRecord = {
      //   domain: workspaceAccount.domain,
      //   customerId: workspaceAccount.customerId,
      //   adminEmail: workspaceAccount.adminEmail,
      //   adminPassword: workspaceAccount.adminPassword,
      //   status: workspaceAccount.status,
      //   setupDate: workspaceAccount.setupDate,
      //   expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
      //   gmailEnabled: workspaceAccount.gmailEnabled,
      //   dnsConfigured: workspaceAccount.dnsConfigured,
      //   domainVerified: workspaceAccount.domainVerified,
      //   stripePaymentId: session.id,
      //   price: 15000, // $150
      // };

      // await saveGoogleWorkspace(userKey, workspaceRecord);
      // console.log('✅ Google Workspace saved to DynamoDB');
    }
  } catch (err) {
    console.error('❌ Auto-provision Google Workspace error:', err);
    // Don't fail the entire process if Workspace provisioning fails
  }
}

function safeParseArray(input: string | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function handleGoogleWorkspacePurchase(session: Stripe.Checkout.Session) {
  console.log('⚠️ Google Workspace provisioning temporarily disabled');
  console.log('Processing standalone Google Workspace purchase:', session.id);
  
  // Temporarily disabled - Google Workspace integration
  return;
  
  // const domain = session.metadata?.domain || '';
  // const primaryEmail = session.metadata?.primary_email || '';
  // const customerEmail = session.customer_details?.email || (session.customer_email as string) || session.metadata?.user_email || '';
  // const customerName = session.customer_details?.name || session.metadata?.user_name || 'Customer';
  
  // console.log('Google Workspace purchase details:', {
  //   domain,
  //   primaryEmail,
  //   customerEmail,
  //   customerName,
  // });
  
  // if (!domain || !customerEmail) {
  //   console.error('Missing domain or customer email for Google Workspace purchase');
  //   return;
  // }

  // // Check if this is a test payment (Stripe test mode)
  // const isTestMode = session.id.startsWith('cs_test_');
  
  // if (isTestMode) {
  //   console.log('⚠️ TEST MODE: Skipping real Google Workspace provisioning');
  //   console.log('💡 In production, this would create a real Google Workspace account for:', domain);
    
  //   // Save mock data for testing
  //   const mockWorkspaceRecord: GoogleWorkspaceRecord = {
  //     domain: domain,
  //     customerId: 'mock-customer-id',
  //     adminEmail: primaryEmail || `admin@${domain}`,
  //     adminPassword: 'MockPassword123!',
  //     status: 'pending',
  //     setupDate: new Date().toISOString(),
  //     expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  //     gmailEnabled: true,
  //     dnsConfigured: false,
  //     domainVerified: false,
  //     stripePaymentId: session.id,
  //     price: 720, // $7.20
  //   };
    
  //   await saveGoogleWorkspace(customerEmail, mockWorkspaceRecord);
  //   console.log('✅ Mock Google Workspace data saved for testing');
  //   return;
  // }

  // try {
  //   console.log('🚀 PRODUCTION MODE: Starting real Google Workspace provisioning for:', domain);
  //   console.log('Primary email requested:', primaryEmail);
    
  //   const workspaceAccount = await createWorkspaceAccount(domain, customerEmail, customerName, primaryEmail);
  //   console.log('✅ Google Workspace account created:', workspaceAccount.adminEmail);

  //   // Save to DynamoDB
  //   const workspaceRecord: GoogleWorkspaceRecord = {
  //     domain: workspaceAccount.domain,
  //     customerId: workspaceAccount.customerId,
  //     adminEmail: workspaceAccount.adminEmail,
  //     adminPassword: workspaceAccount.adminPassword,
  //     status: workspaceAccount.status,
  //     setupDate: workspaceAccount.setupDate,
  //     expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
  //     gmailEnabled: workspaceAccount.gmailEnabled,
  //     dnsConfigured: workspaceAccount.dnsConfigured,
  //     domainVerified: workspaceAccount.domainVerified,
  //     stripePaymentId: session.id,
  //     price: 15000, // $150 (cost to customer)
  //     // Note: Google charges us $72/year for Business Starter plan
  //   };

  //   await saveGoogleWorkspace(customerEmail, workspaceRecord);
  //   console.log('✅ Google Workspace saved to DynamoDB');
  // } catch (err) {
  //   console.error('❌ Failed to provision Google Workspace:', err);
  //   throw err;
  // }
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment succeeded:', paymentIntent.id);
  // Additional payment processing logic can go here
}

async function registerDomain(domain: string, customerEmail: string, customerName: string, userId: string, stripePaymentId: string) {
  const response = await fetch(`${NAMECHEAP_PROXY_URL}/domains/purchase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-token': PROXY_TOKEN,
    },
    body: JSON.stringify({
      domain: domain,
      customer_email: customerEmail,
      customer_name: customerName,
      years: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Domain registration failed: ${response.status}`);
  }

  const result = await response.json();
  console.log(`Domain ${domain} registration result:`, result);
  
  // Store domain registration in DynamoDB
  if (result.success && result.registered) {
    const domainData: DomainRegistration = {
      domain: result.domain,
      namecheapOrderId: (result.order_id || result.orderId || result.transaction_id || result.domain),
      registrationDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
      status: 'active',
      stripePaymentId: stripePaymentId,
      price: parseFloat(result.charged_amount) || 0,
      sslEnabled: result.ssl_enabled || false,
      sslExpiryDate: result.ssl_enabled ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      googleWorkspaceStatus: 'none',
      nameservers: ['dns1.registrar-servers.com', 'dns2.registrar-servers.com']
    };

    try {
      await saveDomainRegistration(userId, domainData);
      console.log(`Domain ${domain} saved to DynamoDB`);
    } catch (dbError) {
      console.error(`Failed to save domain ${domain} to DynamoDB:`, dbError);
      // Don't throw error - domain is still registered
    }
  }
  
  return result;
}
