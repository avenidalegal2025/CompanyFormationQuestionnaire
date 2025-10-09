import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { SERVICES } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function POST(request: NextRequest) {
  try {
    const { formData, selectedServices, totalPrice } = await request.json();

    // Create line items for Stripe
    const lineItems = selectedServices.map((serviceId: string) => {
      const service = SERVICES.find(s => s.id === serviceId);
      if (!service) {
        throw new Error(`Service ${serviceId} not found`);
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: service.name,
            description: service.description,
            metadata: {
              serviceId: service.id,
              category: service.category,
            },
          },
          unit_amount: service.price,
        },
        quantity: 1,
      };
    });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/cancel`,
      metadata: {
        formData: JSON.stringify(formData),
        selectedServices: JSON.stringify(selectedServices),
        entityType: formData.company?.entityType || 'LLC',
      },
      customer_email: formData.profile?.email,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
