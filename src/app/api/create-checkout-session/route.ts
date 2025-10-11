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

    // Get the base URL from the request
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;

        console.log('Creating checkout session with:', {
          baseUrl,
          lineItemsCount: lineItems.length,
          entityType,
          state,
          hasUsAddress,
          hasUsPhone,
          skipAgreement,
          lineItems: lineItems.map(item => ({
            name: item.price_data?.product_data?.name,
            amount: item.price_data?.unit_amount,
            quantity: item.quantity
          }))
        });

        // Validate line items
        if (lineItems.length === 0) {
          throw new Error('No line items provided');
        }

        lineItems.forEach((item, index) => {
          if (!item.price_data?.product_data?.name) {
            throw new Error(`Line item ${index} missing product name`);
          }
          if (!item.price_data?.unit_amount || item.price_data.unit_amount <= 0) {
            throw new Error(`Line item ${index} has invalid amount: ${item.price_data?.unit_amount}`);
          }
        });

    // Test Stripe connection
    try {
      const account = await stripe.accounts.retrieve();
      console.log('Stripe connection successful, account:', account.id);
    } catch (stripeError) {
      console.error('Stripe connection failed:', stripeError);
      throw new Error('Stripe connection failed');
    }

    // Create Stripe checkout session
        // Create a minimal session with just one simple line item
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Company Formation Service',
              },
              unit_amount: 60000, // $600.00
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/checkout/cancel`,
        });

        console.log('Checkout session created successfully:', session.id);
        return NextResponse.json({ 
          sessionId: session.id,
          success: true 
        });
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
