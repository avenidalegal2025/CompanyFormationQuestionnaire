import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { saveDomainRegistration, type DomainRegistration } from '@/lib/dynamo';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token';

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
  
  if (session.metadata?.type !== 'domain_purchase') {
    console.log('Not a domain purchase, skipping');
    return;
  }

  const domains = JSON.parse(session.metadata.domains || '[]');
  const customerEmail = session.customer_email || '';
  const customerName = session.metadata.customer_name || '';
  const userId = session.metadata.user_id || '';

  console.log('Processing domain purchase:', { domains, customerEmail, customerName, userId });

  // Register domains with Namecheap
  for (const domain of domains) {
    try {
      const registrationResult = await registerDomain(domain, customerEmail, customerName, userId, session.id);
      
      // If domain registration was successful, trigger Google Workspace setup
      if (registrationResult.success && registrationResult.registered) {
        console.log(`Triggering Google Workspace setup for ${domain}`);
        
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
            console.log(`Google Workspace setup initiated for ${domain}:`, workspaceResult);
          } else {
            console.error(`Failed to setup Google Workspace for ${domain}`);
          }
        } catch (workspaceError) {
          console.error(`Error setting up Google Workspace for ${domain}:`, workspaceError);
          // Don't fail the entire process if Workspace setup fails
        }
      }
    } catch (error) {
      console.error(`Failed to register domain ${domain}:`, error);
      // Continue with other domains even if one fails
    }
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
      namecheapOrderId: result.domain, // Use domain as ID for now
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
