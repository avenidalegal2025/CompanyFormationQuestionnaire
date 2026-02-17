#!/usr/bin/env ts-node
/**
 * Test script to simulate company creation flow
 * This tests the full webhook flow including document generation
 */

import Stripe from 'stripe';

// Environment variables should be loaded by the runtime

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not found in .env.local');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover',
});

/**
 * Create a test Stripe checkout session completion event
 */
async function createTestCompany() {
  console.log('🧪 Testing Company Creation Flow\n');
  
  const testEmail = `test-${Date.now()}@example.com`;
  const testCompanyName = `Test Company ${Date.now().toString().slice(-6)}`;
  
  console.log('📋 Test Data:');
  console.log(`   Email: ${testEmail}`);
  console.log(`   Company: ${testCompanyName}`);
  console.log(`   Entity Type: C-Corp`);
  console.log(`   State: Florida\n`);

  // Create a mock Stripe checkout session
  const mockSession = {
    id: `cs_test_${Date.now()}`,
    object: 'checkout.session',
    status: 'complete',
    customer_details: {
      email: testEmail,
      name: 'Test User',
    },
    customer_email: testEmail,
    metadata: {
      type: 'company_formation',
      entityType: 'C-Corp',
      state: 'Florida',
      companyName: testCompanyName,
      hasUsAddress: 'true',
      hasUsPhone: 'true',
      skipAgreement: 'false',
      totalAmount: '1380.00',
      selectedServices: JSON.stringify(['formation', 'business_address', 'business_phone']),
      userId: testEmail,
      customer_name: 'Test User',
    },
    amount_total: 138000,
    currency: 'usd',
    payment_status: 'paid',
    payment_intent: `pi_test_${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
  };

  console.log('📤 Calling webhook endpoint...');
  console.log(`   URL: ${BASE_URL}/api/webhooks/stripe\n`);

  try {
    const response = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test-signature', // Mock signature for testing
      },
      body: JSON.stringify({
        type: 'checkout.session.completed',
        data: {
          object: mockSession,
        },
      }),
    });

    const responseText = await response.text();
    console.log(`📡 Response Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      console.log('✅ Webhook processed successfully!\n');
      console.log('📋 Next steps:');
      console.log(`   1. Check Airtable for record: ${testCompanyName}`);
      console.log(`   2. Check DynamoDB for documents: user:${testEmail}`);
      console.log(`   3. Check S3 bucket: avenida-legal-documents/${testCompanyName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-*/formation/`);
      console.log(`   4. Verify documents have unique filenames (not placeholder.docx)\n`);
    } else {
      console.error('❌ Webhook failed:', responseText);
    }
  } catch (error: any) {
    console.error('❌ Error calling webhook:', error.message);
    console.error('   Make sure the server is running and accessible');
  }
}

// Run the test
createTestCompany().catch(console.error);
