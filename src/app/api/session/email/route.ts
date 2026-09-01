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

    // This route cannot require a session: its only caller is the checkout
    // success page, reached straight off the Stripe redirect, where the buyer
    // is usually not signed in yet. So instead of authenticating the caller we
    // narrow what a bare session_id is worth.
    //
    // Stripe ids are high entropy and not guessable, but they persist in URLs,
    // browser history, Referer headers and logs. Without these two checks any
    // id that ever leaked stayed a permanent email-lookup oracle.

    // 1. Only completed purchases. An abandoned or still-open checkout has no
    //    business disclosing the email that was typed into it.
    const paid =
      session.payment_status === 'paid' ||
      session.payment_status === 'no_payment_required';
    if (!paid) {
      return NextResponse.json(
        { error: 'Session is not complete' },
        { status: 403 }
      );
    }

    // 2. Only recently created sessions. The success page reads this within
    //    seconds of the redirect, so a day is already far wider than the real
    //    use. After that the id stops resolving to an email at all.
    const MAX_AGE_SECONDS = 24 * 60 * 60;
    const ageSeconds = Math.floor(Date.now() / 1000) - (session.created || 0);
    if (ageSeconds > MAX_AGE_SECONDS) {
      return NextResponse.json(
        { error: 'Session has expired' },
        { status: 403 }
      );
    }

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
    // Logged server-side, not echoed: Stripe's message distinguishes "no such
    // session" from other failures, which is exactly the signal an enumerator
    // wants.
    console.error('Error fetching session email:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session email' },
      { status: 500 }
    );
  }
}

