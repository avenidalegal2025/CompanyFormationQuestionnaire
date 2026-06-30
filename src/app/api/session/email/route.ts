import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Lazy Stripe init: avoid throwing at module scope when STRIPE_SECRET_KEY is
// absent at build time (next build imports route modules to collect page data).
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-09-30.clover',
  });
  return _stripe;
}

/**
 * GET /api/session/email?session_id=xxx
 * Gets the customer email from a Stripe checkout session
 */
export async function GET(request: NextRequest) {
  try {
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id parameter is required' },
        { status: 400 }
      );
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const email = session.customer_details?.email || session.customer_email || '';

    if (!email) {
      return NextResponse.json(
        { error: 'No email found in session' },
        { status: 404 }
      );
    }

    // Also extract entityType from session metadata so the success page
    // can show the correct document list even when localStorage is empty.
    const entityType = session.metadata?.entityType || '';

    return NextResponse.json({
      success: true,
      email,
      entityType,
    });
  } catch (error: any) {
    console.error('Error fetching session email:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch session email',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

