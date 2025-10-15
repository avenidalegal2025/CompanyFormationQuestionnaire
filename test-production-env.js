// Test script to verify production environment variables
const https = require('https');

console.log('🔧 Testing Production Environment Variables...\n');

// Test Namecheap Production API
async function testNamecheapAPI() {
  console.log('📡 Testing Namecheap Production API...');
  
  const proxyUrl = 'http://3.149.156.19:8000';
  const testData = {
    domains: ['test-domain.com']
  };

  try {
    const response = await fetch(`${proxyUrl}/domains/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token',
      },
      body: JSON.stringify(testData),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Namecheap API: Connected successfully');
      console.log(`   Environment: ${data.cached ? 'Using cached data' : 'Fresh API call'}`);
    } else {
      console.log('❌ Namecheap API: Connection failed');
      console.log(`   Status: ${response.status}`);
    }
  } catch (error) {
    console.log('❌ Namecheap API: Error connecting');
    console.log(`   Error: ${error.message}`);
  }
}

// Test Google Workspace API
async function testGoogleWorkspace() {
  console.log('\n📧 Testing Google Workspace API...');
  
  const requiredVars = [
    'GOOGLE_WORKSPACE_CLIENT_ID',
    'GOOGLE_WORKSPACE_CLIENT_SECRET', 
    'GOOGLE_WORKSPACE_REFRESH_TOKEN',
    'GOOGLE_WORKSPACE_CUSTOMER_ID'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length === 0) {
    console.log('✅ Google Workspace: All environment variables present');
  } else {
    console.log('❌ Google Workspace: Missing environment variables');
    console.log(`   Missing: ${missing.join(', ')}`);
  }
}

// Test Stripe
async function testStripe() {
  console.log('\n💳 Testing Stripe Configuration...');
  
  if (process.env.STRIPE_SECRET_KEY) {
    console.log('✅ Stripe: Secret key configured');
    console.log(`   Key starts with: ${process.env.STRIPE_SECRET_KEY.substring(0, 7)}...`);
  } else {
    console.log('❌ Stripe: Secret key missing');
  }
}

// Test Auth0
async function testAuth0() {
  console.log('\n🔐 Testing Auth0 Configuration...');
  
  const requiredVars = [
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'AUTH0_ISSUER_BASE_URL',
    'AUTH_SECRET'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length === 0) {
    console.log('✅ Auth0: All environment variables present');
  } else {
    console.log('❌ Auth0: Missing environment variables');
    console.log(`   Missing: ${missing.join(', ')}`);
  }
}

// Run all tests
async function runTests() {
  await testNamecheapAPI();
  await testGoogleWorkspace();
  await testStripe();
  await testAuth0();
  
  console.log('\n🎯 Environment Setup Checklist:');
  console.log('□ Namecheap production API credentials added');
  console.log('□ Namecheap production IP whitelisted (3.149.156.19)');
  console.log('□ Google Workspace reseller account configured');
  console.log('□ Google Cloud project created with Admin SDK enabled');
  console.log('□ OAuth credentials generated with admin scope');
  console.log('□ Vercel environment variables updated');
  console.log('□ Proxy server deployed with production config');
}

runTests().catch(console.error);
