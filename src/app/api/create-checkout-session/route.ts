import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { SERVICES, FORMATION_PRICES } from '@/lib/pricing';

// Only initialize Stripe if the secret key is available
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover',
    })
  : null;

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const { 
      formData, 
      selectedServices, 
      totalPrice, 
      entityType, 
      state, 
      hasUsAddress, 
      hasUsPhone, 
      skipAgreement 
    } = await request.json();

    // Create line items for Stripe
    const lineItems = [];
    
    // Add formation service
    const formationPrice = FORMATION_PRICES[entityType]?.[state] || (entityType === 'LLC' ? 60000 : 80000);
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Formación de ${entityType} - ${state}`,
          description: `Formación completa de ${entityType} con archivo estatal y documentación`,
          metadata: {
            serviceId: 'formation',
            category: 'formation',
            entityType,
            state,
          },
        },
        unit_amount: formationPrice,
      },
      quantity: 1,
    });

    // Add other selected services
    selectedServices.forEach((serviceId: string) => {
      const service = SERVICES.find(s => s.id === serviceId);
      if (service) {
        lineItems.push({
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
        });
      }
    });

    // Create or get customer
    let customer;
    if (formData.profile?.email) {
      try {
        const existingCustomers = await stripe.customers.list({
          email: formData.profile.email,
          limit: 1,
        });
        
        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
        } else {
          customer = await stripe.customers.create({
            email: formData.profile.email,
            name: formData.profile.name || formData.company?.companyName,
            metadata: {
              entityType: entityType,
              state: state,
            },
          });
        }
      } catch (customerError) {
        console.warn('Error creating/finding customer:', customerError);
        // Continue without customer if there's an error
      }
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/cancel`,
      customer_email: formData.profile?.email,
      metadata: {
        formData: JSON.stringify(formData),
        selectedServices: JSON.stringify(selectedServices),
        entityType: entityType,
        state: state,
        hasUsAddress: hasUsAddress.toString(),
        hasUsPhone: hasUsPhone.toString(),
        skipAgreement: skipAgreement.toString(),
      },
      billing_address_collection: 'required',
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
