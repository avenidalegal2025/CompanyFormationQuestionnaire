#!/usr/bin/env node

/**
 * Stripe Webhook Testing Script
 * 
 * This script helps test the Stripe webhook integration
 * Run with: node test-webhook.js
 */

const https = require('https');
const http = require('http');

const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/stripe';
const TEST_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/test';

// Mock Stripe webhook events
const mockEvents = {
  checkoutSessionCompleted: {
    id: 'evt_test_webhook',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123456789',
        object: 'checkout.session',
        payment_status: 'paid',
        customer_email: 'test@example.com',
        metadata: {
          type: 'domain_purchase',
          domains: '["testdomain.com", "testdomain.org"]',
          customer_name: 'Test User'
        }
      }
    }
  },
  paymentIntentSucceeded: {
    id: 'evt_test_webhook_2',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_123456789',
        object: 'payment_intent',
        status: 'succeeded',
        amount: 2598, // $25.98 in cents
        currency: 'usd'
      }
    }
  }
};

function makeRequest(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    };

    const req = client.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: responseData
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function testWebhook() {
  console.log('🧪 Testing Stripe Webhook Integration\n');

  // Test 1: Basic webhook connectivity
  console.log('1. Testing basic webhook connectivity...');
  try {
    const response = await makeRequest(TEST_WEBHOOK_URL, JSON.stringify({ test: 'connectivity' }));
    console.log(`   ✅ Status: ${response.statusCode}`);
    console.log(`   ✅ Response: ${response.data}\n`);
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
    return;
  }

  // Test 2: Checkout session completed event
  console.log('2. Testing checkout.session.completed event...');
  try {
    const eventData = JSON.stringify(mockEvents.checkoutSessionCompleted);
    const response = await makeRequest(WEBHOOK_URL, eventData, {
      'stripe-signature': 'test_signature' // This will fail signature verification, but we can see the response
    });
    console.log(`   ✅ Status: ${response.statusCode}`);
    console.log(`   ✅ Response: ${response.data}\n`);
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  // Test 3: Payment intent succeeded event
  console.log('3. Testing payment_intent.succeeded event...');
  try {
    const eventData = JSON.stringify(mockEvents.paymentIntentSucceeded);
    const response = await makeRequest(WEBHOOK_URL, eventData, {
      'stripe-signature': 'test_signature'
    });
    console.log(`   ✅ Status: ${response.statusCode}`);
    console.log(`   ✅ Response: ${response.data}\n`);
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  console.log('🎉 Webhook testing completed!');
  console.log('\n📝 Next Steps:');
  console.log('1. Set up Stripe CLI: stripe listen --forward-to localhost:3000/api/webhooks/stripe');
  console.log('2. Add the webhook secret to your .env.local file');
  console.log('3. Test with real Stripe events: stripe trigger checkout.session.completed');
}

// Run the test
testWebhook().catch(console.error);
