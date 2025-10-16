import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token';

export async function POST(request: NextRequest) {
  try {
    // Get user session for user_id
    const userSession = await getServerSession(authOptions);
    if (!userSession?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { domains, customerEmail, customerName } = await request.json();

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json(
        { error: 'Domains list is required' },
        { status: 400 }
      );
    }

    if (!customerEmail) {
      return NextResponse.json(
        { error: 'Customer email is required' },
        { status: 400 }
      );
    }

    // Use session email as user_id (or you can use a different identifier)
    const userId = userSession.user.email;

    // Get pricing for the domains
    const pricingResponse = await fetch(`${NAMECHEAP_PROXY_URL}/domains/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': PROXY_TOKEN,
      },
      body: JSON.stringify({ domains }),
    });

    if (!pricingResponse.ok) {
      throw new Error('Failed to get domain pricing');
    }

    const pricingData = await pricingResponse.json();
    if (!pricingData.success) {
      throw new Error('Invalid pricing data');
    }

    // Use original pricing without markup
    const pricingWithMarkup = pricingData.pricing.map((p: any) => ({
      ...p,
      price_with_markup: p.price, // No markup
    }));

    // Create line items for Stripe without markup
    const lineItems = pricingWithMarkup.map((domain: any) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${domain.domain} Domain Registration`,
          description: `1-year domain registration for ${domain.domain}`,
          metadata: {
            domain: domain.domain,
            extension: domain.extension,
            renewal_price: domain.renewal_price.toString(),
          },
        },
        unit_amount: Math.round(domain.price * 100), // No markup, convert to cents
      },
      quantity: 1,
    }));

    // Calculate total amount without markup
    const totalAmount = pricingWithMarkup.reduce((sum: number, d: any) => sum + d.price, 0);

    // Get the base URL and trim any whitespace/newlines
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 
      `https://${request.nextUrl.host}`).trim();

    // Validate baseUrl
    try {
      new URL(baseUrl);
    } catch (urlError) {
      console.error('Invalid baseUrl:', baseUrl, urlError);
      throw new Error(`Invalid base URL: ${baseUrl}`);
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/client/domains?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/client/domains?canceled=true`,
      customer_email: customerEmail,
      metadata: {
        domains: JSON.stringify(domains),
        customer_name: customerName || '',
        total_amount: totalAmount.toString(),
        type: 'domain_purchase',
        user_id: userId,
      },
      invoice_creation: {
        enabled: true,
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      totalAmount: totalAmount,
      domains: domains,
    });

  } catch (error) {
    console.error('Checkout session creation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
