// Test script to verify the complete domain flow
const https = require('https');

console.log('🧪 Testing Complete Domain Flow...\n');

// Test 1: Proxy Server Pricing
async function testProxyPricing() {
  console.log('📡 Testing Proxy Server Pricing...');
  
  try {
    const response = await fetch('http://3.149.156.19:8000/domains/pricing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': 'super-secret-32char-token-12345',
      },
      body: JSON.stringify({ domains: ['test.com'] }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Proxy Pricing: Working');
      console.log(`   Price: $${data.pricing[0].price}`);
      console.log(`   Renewal: $${data.pricing[0].renewal_price}`);
      return true;
    } else {
      console.log('❌ Proxy Pricing: Failed');
      console.log(`   Status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Proxy Pricing: Error');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Test 2: Next.js Domain Search
async function testNextJSSearch() {
  console.log('\n🔍 Testing Next.js Domain Search...');
  
  try {
    const response = await fetch('http://localhost:3000/api/domains/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain: 'testcompany' }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Next.js Search: Working');
      console.log(`   Results: ${data.results?.length || 0} domains found`);
      console.log(`   Available: ${data.availableCount || 0} available`);
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Next.js Search: Failed');
      console.log(`   Error: ${error.error}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Next.js Search: Error');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Test 3: Domain Purchase Flow
async function testDomainPurchase() {
  console.log('\n💳 Testing Domain Purchase Flow...');
  
  try {
    const response = await fetch('http://localhost:3000/api/domains/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domains: ['testcompany.com'],
        customerEmail: 'test@example.com',
        customerName: 'Test Customer'
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Domain Purchase: Working');
      console.log(`   Session ID: ${data.sessionId}`);
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Domain Purchase: Failed');
      console.log(`   Error: ${error.error}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Domain Purchase: Error');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Run all tests
async function runTests() {
  const results = [];
  
  results.push(await testProxyPricing());
  results.push(await testNextJSSearch());
  results.push(await testDomainPurchase());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Domain flow is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
  }
}

runTests().catch(console.error);
