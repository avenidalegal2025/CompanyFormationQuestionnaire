import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = headers().get('stripe-signature');

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
  const customerEmail = session.customer_email;
  const customerName = session.metadata.customer_name || '';

  console.log('Processing domain purchase:', { domains, customerEmail, customerName });

  // Register domains with Namecheap
  for (const domain of domains) {
    try {
      await registerDomain(domain, customerEmail, customerName);
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

async function registerDomain(domain: string, customerEmail: string, customerName: string) {
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
  
  return result;
}
