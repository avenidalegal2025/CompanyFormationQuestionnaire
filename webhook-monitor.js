#!/usr/bin/env node

/**
 * Stripe Webhook Monitor
 * 
 * This script monitors webhook events and helps debug issues
 * Run with: node webhook-monitor.js
 */

const https = require('https');
const http = require('http');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/stripe';
const MONITOR_INTERVAL = 5000; // 5 seconds

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

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

async function testWebhookHealth() {
  try {
    const response = await makeRequest(WEBHOOK_URL, JSON.stringify({ test: 'health_check' }));
    return {
      healthy: response.statusCode === 200,
      statusCode: response.statusCode,
      response: response.data
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

async function simulateWebhookEvent(eventType) {
  const events = {
    'checkout.session.completed': {
      id: `evt_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_test_${Date.now()}`,
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
    'payment_intent.succeeded': {
      id: `evt_${Date.now()}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `pi_test_${Date.now()}`,
          object: 'payment_intent',
          status: 'succeeded',
          amount: 2598,
          currency: 'usd'
        }
      }
    }
  };

  const event = events[eventType];
  if (!event) {
    log(`❌ Unknown event type: ${eventType}`, 'red');
    return;
  }

  try {
    log(`📤 Sending ${eventType} event...`, 'yellow');
    const response = await makeRequest(WEBHOOK_URL, JSON.stringify(event), {
      'stripe-signature': 'test_signature' // This will fail signature verification
    });
    
    if (response.statusCode === 400 && response.data.includes('Invalid signature')) {
      log(`✅ Webhook is working (correctly rejected invalid signature)`, 'green');
    } else {
      log(`⚠️  Unexpected response: ${response.statusCode} - ${response.data}`, 'yellow');
    }
  } catch (error) {
    log(`❌ Error sending event: ${error.message}`, 'red');
  }
}

function displayHelp() {
  log('\n🔧 Stripe Webhook Monitor', 'bright');
  log('========================', 'bright');
  log('');
  log('Commands:');
  log('  health     - Check webhook health');
  log('  test       - Test webhook with mock events');
  log('  monitor    - Start monitoring webhook health');
  log('  help       - Show this help message');
  log('');
  log('Environment Variables:');
  log('  WEBHOOK_URL - Webhook endpoint URL (default: http://localhost:3000/api/webhooks/stripe)');
  log('');
}

async function startMonitoring() {
  log('🔍 Starting webhook monitoring...', 'cyan');
  log(`📡 Monitoring: ${WEBHOOK_URL}`, 'blue');
  log('Press Ctrl+C to stop\n', 'yellow');

  const monitor = setInterval(async () => {
    const health = await testWebhookHealth();
    const timestamp = new Date().toISOString();
    
    if (health.healthy) {
      log(`[${timestamp}] ✅ Webhook is healthy (${health.statusCode})`, 'green');
    } else {
      log(`[${timestamp}] ❌ Webhook is unhealthy: ${health.error || health.statusCode}`, 'red');
    }
  }, MONITOR_INTERVAL);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(monitor);
    log('\n🛑 Monitoring stopped', 'yellow');
    process.exit(0);
  });
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'health':
      log('🏥 Checking webhook health...', 'cyan');
      const health = await testWebhookHealth();
      if (health.healthy) {
        log(`✅ Webhook is healthy (${health.statusCode})`, 'green');
        log(`📄 Response: ${health.response}`, 'blue');
      } else {
        log(`❌ Webhook is unhealthy: ${health.error || health.statusCode}`, 'red');
      }
      break;

    case 'test':
      log('🧪 Testing webhook with mock events...', 'cyan');
      await simulateWebhookEvent('checkout.session.completed');
      await simulateWebhookEvent('payment_intent.succeeded');
      break;

    case 'monitor':
      await startMonitoring();
      break;

    case 'help':
    case '--help':
    case '-h':
      displayHelp();
      break;

    default:
      displayHelp();
      break;
  }
}

// Run the monitor
main().catch(console.error);
