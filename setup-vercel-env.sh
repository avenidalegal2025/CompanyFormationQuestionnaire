#!/bin/bash

# Vercel Environment Variables Setup Script
# This script helps set up all required environment variables for the domain registration system

set -e

echo "🔧 Setting up Vercel Environment Variables"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if user is logged into Vercel
if ! vercel whoami &> /dev/null; then
    echo -e "${RED}❌ Please log in to Vercel first:${NC}"
    echo "   vercel login"
    exit 1
fi

echo -e "${GREEN}✅ Logged in to Vercel${NC}"

# Function to add environment variable
add_env_var() {
    local var_name=$1
    local var_description=$2
    local is_secret=${3:-false}
    
    echo -e "${YELLOW}📝 Setting up $var_name${NC}"
    echo -e "${BLUE}   $var_description${NC}"
    
    if [ "$is_secret" = true ]; then
        echo -e "${YELLOW}   (This will be hidden for security)${NC}"
    fi
    
    vercel env add "$var_name"
}

echo ""
echo -e "${BLUE}🔐 Setting up Auth0 Configuration${NC}"
echo "=================================="

add_env_var "AUTH0_CLIENT_ID" "Your Auth0 Application Client ID" true
add_env_var "AUTH0_CLIENT_SECRET" "Your Auth0 Application Client Secret" true
add_env_var "AUTH0_ISSUER" "Your Auth0 Domain (e.g., https://your-domain.auth0.com)" false
add_env_var "AUTH_SECRET" "NextAuth secret (generate with: openssl rand -base64 32)" true

echo ""
echo -e "${BLUE}💳 Setting up Stripe Configuration${NC}"
echo "=================================="

add_env_var "STRIPE_SECRET_KEY" "Your Stripe Secret Key (starts with sk_live_ or sk_test_)" true
add_env_var "STRIPE_PUBLISHABLE_KEY" "Your Stripe Publishable Key (starts with pk_live_ or pk_test_)" false
add_env_var "STRIPE_WEBHOOK_SECRET" "Your Stripe Webhook Secret (starts with whsec_)" true

echo ""
echo -e "${BLUE}🌐 Setting up Application Configuration${NC}"
echo "=================================="

# Get the current Vercel project URL
PROJECT_URL=$(vercel ls --json | jq -r '.[0].url' 2>/dev/null || echo "https://your-app.vercel.app")

echo -e "${YELLOW}📝 Setting up NEXT_PUBLIC_BASE_URL${NC}"
echo -e "${BLUE}   This should be your Vercel app URL${NC}"
echo -e "${YELLOW}   Detected URL: $PROJECT_URL${NC}"
echo -e "${YELLOW}   Press Enter to use detected URL or enter a different one:${NC}"
read -r custom_url

if [ -n "$custom_url" ]; then
    PROJECT_URL="$custom_url"
fi

vercel env add "NEXT_PUBLIC_BASE_URL" <<< "$PROJECT_URL"

echo ""
echo -e "${BLUE}🔗 Setting up Namecheap Proxy Configuration${NC}"
echo "=================================="

add_env_var "NAMECHEAP_PROXY_TOKEN" "Token for Namecheap proxy server (default: super-secret-32char-token)" true

echo ""
echo -e "${GREEN}🎉 Environment Variables Setup Complete!${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "1. Verify all environment variables in Vercel Dashboard"
echo "2. Update your Auth0 application callback URLs:"
echo "   - $PROJECT_URL/api/auth/callback/auth0"
echo "   - $PROJECT_URL/client/domains"
echo "3. Update your Stripe webhook endpoint:"
echo "   - $PROJECT_URL/api/webhooks/stripe"
echo "4. Ensure your Lightsail proxy server is running"
echo "5. Test the complete flow"
echo ""
echo -e "${YELLOW}💡 To view your environment variables:${NC}"
echo "   vercel env ls"
echo ""
echo -e "${YELLOW}💡 To redeploy with new environment variables:${NC}"
echo "   vercel --prod"
