import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { SERVICES, FORMATION_PRICES } from '@/lib/pricing';
import { authOptions } from '@/lib/auth';
import { saveFormData } from '@/lib/dynamo';
import { saveFormDataSnapshot } from '@/lib/s3-vault';

// Initialize Stripe from env ONLY. No hardcoded fallback: silently falling back
// to a test key in production would let "successful" checkouts collect no real
// money. Fail loudly if the key is missing so misconfiguration is obvious.
//
// IMPORTANT: do this LAZILY, not at module scope. `next build` collects page
// data by importing every route module; a module-scope throw on a missing env
// var breaks the build on any environment (e.g. Vercel Preview) where the key
// isn't present at build time. Throwing inside the handler keeps the fail-loud
// behavior at request time while letting the build succeed.
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  console.log('Stripe key starts with:', stripeKey.substring(0, 8)); // sk_test_ / sk_live_
  _stripe = new Stripe(stripeKey, {
    apiVersion: '2025-09-30.clover',
  });
  return _stripe;
}

export async function POST(request: NextRequest) {
  try {
    // Initialize Stripe (fail loud at request time if misconfigured).
    const stripe = getStripe();

    // Get the authenticated session
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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

    // Debug the incoming data
    console.log('Incoming request data:', {
      formData: formData ? Object.keys(formData) : 'undefined',
      selectedServices,
      totalPrice,
      entityType,
      state,
      hasUsAddress,
      hasUsPhone,
      skipAgreement
    });

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
    const normalizedSelected = Array.from(new Set(selectedServices || []));
    (normalizedSelected as string[]).forEach((serviceId: string) => {
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

    // Ensure agreement is included based on entity type if not skipped
    if (!skipAgreement) {
      const agreementId = entityType === 'LLC' ? 'operating_agreement' : (entityType === 'C-Corp' || entityType === 'S-Corp') ? 'shareholder_agreement' : undefined;
      if (agreementId && !normalizedSelected.includes(agreementId)) {
        const agreementService = SERVICES.find(s => s.id === agreementId);
        if (agreementService) {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: agreementService.name,
                description: agreementService.description,
                metadata: { serviceId: agreementService.id, category: agreementService.category },
              },
              unit_amount: agreementService.price,
            },
            quantity: 1,
          });
        }
      }
    }

    // --- DEMO_DOLLAR override (prod UAT only) -------------------------------
    // When DEMO_DOLLAR=1 AND the signed-in email is allowlisted, collapse the
    // whole cart to a single $1.00 line item so a real (live-mode) charge can
    // be run end-to-end for ~$1 instead of the full formation price. Off by
    // default; fail-safe (full price) if the flag is set but email not listed.
    // DEMO_DOLLAR_EMAILS = comma-separated allowlist, or "*" for any signed-in user.
    const demoDollarOn = process.env.DEMO_DOLLAR === '1';
    let demoDollarApplied = false;
    if (demoDollarOn) {
      const allow = (process.env.DEMO_DOLLAR_EMAILS || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const email = (session.user.email || '').toLowerCase();
      const allowed = allow.includes('*') || allow.includes(email);
      if (allowed) {
        lineItems.length = 0;
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Avenida UAT — demo ($1) · ${entityType} ${state}`,
              description: 'Prueba de producción end-to-end. Cargo de demostración de $1.00 USD.',
              metadata: { serviceId: 'demo_dollar', category: 'demo' },
            },
            unit_amount: 100,
          },
          quantity: 1,
        });
        demoDollarApplied = true;
        console.log(`💵 DEMO_DOLLAR applied for ${email} — cart collapsed to $1.00`);
      } else {
        console.warn(`⚠️ DEMO_DOLLAR=1 but ${email} not in DEMO_DOLLAR_EMAILS allowlist — charging FULL price`);
      }
    }
    // -----------------------------------------------------------------------

    // Create or get customer using session email
    let customer;
    try {
      const existingCustomers = await stripe.customers.list({
        email: session.user.email,
        limit: 1,
      });
      
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: session.user.email,
          name: session.user.name || formData.company?.companyName,
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

    // Get the base URL from the request
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 
      `https://${request.nextUrl.host}`).trim();

    // Validate baseUrl
    try {
      new URL(baseUrl);
    } catch (urlError) {
      console.error('Invalid baseUrl:', baseUrl, urlError);
      throw new Error(`Invalid base URL: ${baseUrl}`);
    }

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

    // Save form data to DynamoDB for later retrieval in webhook
    try {
      console.log('💾 Attempting to save formData to DynamoDB for user:', session.user.email);
      console.log('📋 FormData structure:', {
        hasCompany: !!formData?.company,
        hasOwners: !!formData?.owners,
        hasAdmin: !!formData?.admin,
        hasAgreement: !!formData?.agreement,
      });
      
      await saveFormData(session.user.email, formData);
      console.log('✅ Form data saved to DynamoDB for user:', session.user.email);
    } catch (dynamoError) {
      console.error('❌ Failed to save form data to DynamoDB:', dynamoError);
      console.error('❌ DynamoDB error details:', JSON.stringify(dynamoError, null, 2));
      // Continue anyway - we can still process the payment without Airtable sync
    }

    // Test Stripe connection
    try {
      const account = await stripe.accounts.retrieve();
      console.log('Stripe connection successful, account:', account.id);
    } catch (stripeError) {
      console.error('Stripe connection failed:', stripeError);
      throw new Error('Stripe connection failed');
    }

    // Create Stripe checkout session with simplified approach
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      customer_email: session.user.email,
      invoice_creation: {
        enabled: true,
      },
      metadata: {
        type: 'company_formation',
        entityType: entityType,
        state: state,
        companyName: formData?.company?.companyName || 'Company',
        hasUsAddress: hasUsAddress.toString(),
        hasUsPhone: hasUsPhone.toString(),
        skipAgreement: skipAgreement.toString(),
        totalAmount: totalPrice.toString(),
        selectedServices: JSON.stringify(normalizedSelected),
        forwardPhoneE164: formData?.company?.forwardPhoneE164 || '',
        demoDollar: demoDollarApplied.toString(),
        userId: session.user.email // Store user ID to retrieve form data from DynamoDB
      }
    });

    console.log('Checkout session created successfully:', checkoutSession.id);

    // Save a snapshot of the form data tied to this checkout session for webhook fallback
    try {
      await saveFormDataSnapshot(checkoutSession.id, formData);
      console.log('💾 Form data snapshot saved for session:', checkoutSession.id);
    } catch (snapshotError) {
      console.error('⚠️ Failed to save form data snapshot:', snapshotError);
    }
    return NextResponse.json({ 
      sessionId: checkoutSession.id,
      paymentLinkUrl: checkoutSession.url,
      success: true 
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    // Check if it's a Stripe error
    if (error && typeof error === 'object' && 'type' in error) {
      console.error('Stripe error type:', (error as any).type);
      console.error('Stripe error code:', (error as any).code);
      console.error('Stripe error param:', (error as any).param);
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        details: error instanceof Error ? error.message : 'Unknown error',
        stripeError: error && typeof error === 'object' && 'type' in error ? {
          type: (error as any).type,
          code: (error as any).code,
          param: (error as any).param
        } : null
      },
      { status: 500 }
    );
  }
}
