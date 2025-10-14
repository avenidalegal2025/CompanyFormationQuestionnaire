# Vercel Deployment Guide - Domain Registration System

## 🚀 Complete Domain Registration System Deployment

This guide will help you deploy the complete domain registration system to Vercel with all necessary configurations.

## Prerequisites

- ✅ Vercel CLI installed (`vercel --version`)
- ✅ Stripe account with API keys
- ✅ Auth0 account with application configured
- ✅ Namecheap API credentials
- ✅ Lightsail proxy server running

## Step 1: Environment Variables Setup

### Required Environment Variables for Vercel:

```bash
# Auth0 Configuration
AUTH0_CLIENT_ID=your_auth0_client_id
AUTH0_CLIENT_SECRET=your_auth0_client_secret
AUTH0_ISSUER=https://your-domain.auth0.com
AUTH_SECRET=your_nextauth_secret

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Namecheap Proxy Configuration
NAMECHEAP_PROXY_TOKEN=super-secret-32char-token

# Application Configuration
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

### How to Set Environment Variables in Vercel:

1. **Via Vercel Dashboard:**
   - Go to your project in Vercel Dashboard
   - Navigate to Settings → Environment Variables
   - Add each variable with appropriate values

2. **Via Vercel CLI:**
   ```bash
   vercel env add AUTH0_CLIENT_ID
   vercel env add AUTH0_CLIENT_SECRET
   vercel env add AUTH0_ISSUER
   vercel env add AUTH_SECRET
   vercel env add STRIPE_SECRET_KEY
   vercel env add STRIPE_PUBLISHABLE_KEY
   vercel env add STRIPE_WEBHOOK_SECRET
   vercel env add NAMECHEAP_PROXY_TOKEN
   vercel env add NEXT_PUBLIC_BASE_URL
   ```

## Step 2: Deploy to Vercel

### Initial Deployment:
```bash
# Login to Vercel (if not already logged in)
vercel login

# Deploy the application
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - What's your project's name? company-questionnaire
# - In which directory is your code located? ./
```

### Production Deployment:
```bash
# Deploy to production
vercel --prod
```

## Step 3: Configure Stripe Webhook

### 1. Get Your Vercel URL:
After deployment, you'll get a URL like: `https://your-app.vercel.app`

### 2. Update Stripe Webhook:
- Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
- Update your webhook endpoint URL to: `https://your-app.vercel.app/api/webhooks/stripe`
- Ensure these events are enabled:
  - `checkout.session.completed`
  - `payment_intent.succeeded`

### 3. Update Auth0 Configuration:
- Go to [Auth0 Dashboard → Applications](https://manage.auth0.com/dashboard)
- Update your application's callback URLs:
  - `https://your-app.vercel.app/api/auth/callback/auth0`
  - `https://your-app.vercel.app/client/domains`

## Step 4: Update Lightsail Proxy Configuration

### Update the proxy to use production URLs:
```bash
# SSH into your Lightsail instance
ssh -i ~/Downloads/LightsailDefaultKey-us-east-2.pem ubuntu@3.149.156.19

# Update the proxy configuration
sudo nano /home/ubuntu/lightsail-proxy-server.py
```

Update the success/cancel URLs in the checkout session creation:
```python
success_url: f"{process.env.NEXT_PUBLIC_BASE_URL}/client/domains?success=true&session_id={{CHECKOUT_SESSION_ID}}",
cancel_url: f"{process.env.NEXT_PUBLIC_BASE_URL}/client/domains?canceled=true",
```

## Step 5: Test the Deployment

### 1. Test Domain Search:
```bash
curl -X POST https://your-app.vercel.app/api/domains/search \
  -H "Content-Type: application/json" \
  -d '{"domain": "testcompany"}'
```

### 2. Test Stripe Webhook:
```bash
# Using Stripe CLI
stripe listen --forward-to https://your-app.vercel.app/api/webhooks/stripe

# Test webhook
stripe trigger checkout.session.completed
```

### 3. Test Complete Flow:
1. Visit `https://your-app.vercel.app/client/domains`
2. Sign in with Auth0
3. Search for a domain
4. Add to cart and proceed to checkout
5. Complete payment with test card: `4242 4242 4242 4242`
6. Verify domain registration

## Step 6: Production Checklist

### ✅ Pre-Deployment:
- [ ] All environment variables set
- [ ] Stripe webhook configured
- [ ] Auth0 callbacks updated
- [ ] Lightsail proxy running
- [ ] Namecheap API credentials valid

### ✅ Post-Deployment:
- [ ] Domain search working
- [ ] User authentication working
- [ ] Stripe checkout working
- [ ] Webhook receiving events
- [ ] Domain registration working
- [ ] Success/cancel pages working

## Step 7: Monitoring and Maintenance

### 1. Monitor Webhook Events:
- Check Stripe Dashboard for webhook delivery status
- Monitor Vercel function logs for webhook processing

### 2. Monitor Domain Registrations:
- Check Lightsail proxy logs
- Monitor Namecheap API responses

### 3. Monitor Application Performance:
- Use Vercel Analytics
- Monitor function execution times
- Check error rates

## Troubleshooting

### Common Issues:

1. **Webhook Not Receiving Events:**
   - Check webhook URL is correct
   - Verify webhook secret is set
   - Check Vercel function logs

2. **Domain Registration Failing:**
   - Check Lightsail proxy is running
   - Verify Namecheap API credentials
   - Check proxy logs

3. **Authentication Issues:**
   - Verify Auth0 configuration
   - Check callback URLs
   - Verify AUTH_SECRET is set

4. **Environment Variables Not Loading:**
   - Check variable names are correct
   - Ensure variables are set for production
   - Redeploy after adding variables

## Security Considerations

### ✅ Implemented Security:
- Webhook signature verification
- Auth0 authentication
- HTTPS enforcement
- Environment variable protection
- Payment verification before domain registration

### 🔒 Additional Recommendations:
- Enable Vercel Security Headers
- Set up monitoring and alerting
- Regular security audits
- Backup domain registration data

## Support

If you encounter issues:
1. Check Vercel function logs
2. Check Stripe webhook logs
3. Check Lightsail proxy logs
4. Review this guide for common solutions

---

## 🎉 Deployment Complete!

Your domain registration system is now live on Vercel with:
- ✅ Real domain availability checking
- ✅ Stripe payment processing
- ✅ Automated domain registration
- ✅ Auth0 user authentication
- ✅ Secure webhook handling

**Your app is ready for production!** 🚀
