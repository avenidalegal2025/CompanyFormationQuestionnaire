# Stripe Webhook Setup Guide

## Overview
This guide will help you set up Stripe webhooks to automatically process domain registrations after successful payments.

## Prerequisites
- Stripe account with API keys
- Domain registered and accessible
- Next.js application deployed

## Step 1: Get Stripe API Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers > API Keys**
3. Copy your **Secret Key** (starts with `sk_test_` for test mode)
4. Copy your **Publishable Key** (starts with `pk_test_` for test mode)

## Step 2: Create Environment Variables

Create a `.env.local` file in your project root:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_actual_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Namecheap Proxy Configuration
NAMECHEAP_PROXY_TOKEN=super-secret-32char-token

# Application Configuration
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Step 3: Set Up Webhook Endpoint

### For Development (using Stripe CLI):

1. Install Stripe CLI:
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Windows
   # Download from https://github.com/stripe/stripe-cli/releases
   ```

2. Login to Stripe:
   ```bash
   stripe login
   ```

3. Forward webhooks to your local development server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. Copy the webhook signing secret (starts with `whsec_`) and add it to your `.env.local`

### For Production:

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Set endpoint URL to: `https://yourdomain.com/api/webhooks/stripe`
4. Select events to listen for:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
5. Copy the webhook signing secret and add it to your production environment variables

## Step 4: Test the Webhook

### Using Stripe CLI (Development):
```bash
# Test checkout session completed event
stripe trigger checkout.session.completed

# Test payment intent succeeded event
stripe trigger payment_intent.succeeded
```

### Using Stripe Dashboard (Production):
1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click on your webhook endpoint
3. Click **Send test webhook**
4. Select the event type and send

## Step 5: Verify Webhook is Working

1. Check your application logs for webhook events
2. Test a complete domain purchase flow:
   - Search for a domain
   - Add to cart
   - Complete Stripe checkout
   - Verify domain gets registered automatically

## Webhook Events Handled

### `checkout.session.completed`
- Triggered when a Stripe checkout session is completed
- Automatically registers domains with Namecheap
- Sends confirmation to customer

### `payment_intent.succeeded`
- Triggered when payment is successfully processed
- Additional payment processing logic

## Troubleshooting

### Common Issues:

1. **Webhook signature verification failed**
   - Check that `STRIPE_WEBHOOK_SECRET` is correct
   - Ensure webhook endpoint URL is accessible

2. **Domain registration fails**
   - Check Namecheap proxy server is running
   - Verify API credentials are correct
   - Check domain availability

3. **Webhook not receiving events**
   - Verify webhook endpoint is publicly accessible
   - Check that events are enabled in Stripe dashboard
   - Test with Stripe CLI for development

### Debug Mode:
Add logging to see webhook events:
```typescript
console.log('Webhook received:', event.type, event.id);
```

## Security Notes

- Always verify webhook signatures in production
- Use HTTPS for webhook endpoints
- Keep webhook secrets secure
- Monitor webhook failures and retries

## Next Steps

1. Set up monitoring for webhook failures
2. Add email notifications for domain registrations
3. Implement retry logic for failed registrations
4. Add domain management features
