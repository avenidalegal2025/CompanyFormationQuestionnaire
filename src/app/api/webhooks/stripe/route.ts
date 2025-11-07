import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { saveDomainRegistration, type DomainRegistration, saveBusinessPhone, saveGoogleWorkspace, type GoogleWorkspaceRecord } from '@/lib/dynamo';
import { createWorkspaceAccount } from '@/lib/googleWorkspace';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token-12345';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = (await headers()).get('stripe-signature');

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

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout session completed:', session.id);
  
  if (session.metadata?.type === 'domain_purchase') {
    await handleDomainPurchase(session);
  } else if (session.metadata?.type === 'company_formation') {
    await handleCompanyFormation(session);
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
  
  // Here you would typically:
  // 1. Save the order to your database
  // 2. Trigger company formation process
  // 3. Send confirmation emails
  // 4. Update user's account status
  
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
          await saveBusinessPhone(userKey, {
            phoneNumber: data.phoneNumber,
            areaCode: data.areaCode,
            sid: data.sid,
            forwardToE164: forwardPhoneE164,
            updatedAt: new Date().toISOString(),
          });
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
      console.log('🚀 Starting Google Workspace provisioning...');
      
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

      const workspaceAccount = await createWorkspaceAccount(domain, customerEmail, customerName);
      console.log('✅ Google Workspace account created:', workspaceAccount.adminEmail);

      // Save to DynamoDB
      const userKey = customerEmail;
      const workspaceRecord: GoogleWorkspaceRecord = {
        domain: workspaceAccount.domain,
        customerId: workspaceAccount.customerId,
        adminEmail: workspaceAccount.adminEmail,
        adminPassword: workspaceAccount.adminPassword,
        status: workspaceAccount.status,
        setupDate: workspaceAccount.setupDate,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
        gmailEnabled: workspaceAccount.gmailEnabled,
        dnsConfigured: workspaceAccount.dnsConfigured,
        domainVerified: workspaceAccount.domainVerified,
        stripePaymentId: session.id,
        price: 15000, // $150
      };

      await saveGoogleWorkspace(userKey, workspaceRecord);
      console.log('✅ Google Workspace saved to DynamoDB');
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
