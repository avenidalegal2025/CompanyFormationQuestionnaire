import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { handleCheckoutSessionCompleted } from '@/app/api/webhooks/stripe/route';

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
 * POST /api/stripe/sync-session
 * Manually trigger post-checkout processing using a Stripe session ID.
 *
 * Body:
 * - session_id: Stripe checkout session ID (required)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = body.session_id || body.sessionId || '';

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session_id' },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    await handleCheckoutSessionCompleted(session);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Manual Stripe sync failed:', error);
    return NextResponse.json(
      { error: error.message || 'Manual sync failed' },
      { status: 500 }
    );
  }
}
