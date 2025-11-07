import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth';

const stripeKey = process.env.STRIPE_SECRET_KEY!;
const stripe = new Stripe(stripeKey, {
  apiVersion: '2025-09-30.clover',
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { domain } = await request.json();

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      );
    }

    // Get the base URL
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 
      `https://${request.nextUrl.host}`).trim();

    // Create Stripe checkout session for Google Workspace
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Google Workspace',
            description: 'Correo profesional con Gmail, Google Drive, Meet y más por 1 año',
            metadata: {
              serviceId: 'google_workspace',
              category: 'workspace',
            },
          },
          unit_amount: 15000, // $150
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/client?workspace_success=true`,
      cancel_url: `${baseUrl}/client?workspace_canceled=true`,
      customer_email: session.user.email,
      metadata: {
        type: 'google_workspace_purchase',
        domain: domain,
        user_email: session.user.email,
        user_name: session.user.name || '',
      }
    });

    return NextResponse.json({ 
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
      success: true 
    });
  } catch (error) {
    console.error('Error creating Google Workspace checkout session:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

