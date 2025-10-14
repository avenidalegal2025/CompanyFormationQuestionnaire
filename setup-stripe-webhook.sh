#!/bin/bash

# Stripe Webhook Setup Script
# This script helps set up Stripe webhooks for domain registration

set -e

echo "🔧 Setting up Stripe Webhook for Domain Registration"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo -e "${RED}❌ Stripe CLI is not installed${NC}"
    echo -e "${YELLOW}📦 Installing Stripe CLI...${NC}"
    
    # Detect OS and install accordingly
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install stripe/stripe-cli/stripe
        else
            echo -e "${RED}❌ Homebrew not found. Please install Stripe CLI manually:${NC}"
            echo "   https://github.com/stripe/stripe-cli/releases"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo -e "${YELLOW}📦 Please install Stripe CLI manually:${NC}"
        echo "   https://github.com/stripe/stripe-cli/releases"
        exit 1
    else
        echo -e "${RED}❌ Unsupported OS. Please install Stripe CLI manually:${NC}"
        echo "   https://github.com/stripe/stripe-cli/releases"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Stripe CLI is installed${NC}"

# Check if user is logged in to Stripe
if ! stripe config --list &> /dev/null; then
    echo -e "${YELLOW}🔐 Please log in to Stripe CLI:${NC}"
    stripe login
fi

echo -e "${GREEN}✅ Logged in to Stripe${NC}"

# Get the webhook endpoint URL
read -p "Enter your webhook endpoint URL (e.g., https://yourdomain.com/api/webhooks/stripe): " WEBHOOK_URL

if [ -z "$WEBHOOK_URL" ]; then
    echo -e "${RED}❌ Webhook URL is required${NC}"
    exit 1
fi

echo -e "${BLUE}🔗 Setting up webhook endpoint: $WEBHOOK_URL${NC}"

# Create webhook endpoint
echo -e "${YELLOW}📡 Creating webhook endpoint...${NC}"
WEBHOOK_ID=$(stripe webhook_endpoints create \
    --url="$WEBHOOK_URL" \
    --enabled-events=checkout.session.completed \
    --enabled-events=payment_intent.succeeded \
    --format=json | jq -r '.id')

if [ "$WEBHOOK_ID" = "null" ] || [ -z "$WEBHOOK_ID" ]; then
    echo -e "${RED}❌ Failed to create webhook endpoint${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Webhook endpoint created: $WEBHOOK_ID${NC}"

# Get webhook secret
echo -e "${YELLOW}🔑 Getting webhook secret...${NC}"
WEBHOOK_SECRET=$(stripe webhook_endpoints retrieve "$WEBHOOK_ID" --format=json | jq -r '.secret')

if [ "$WEBHOOK_SECRET" = "null" ] || [ -z "$WEBHOOK_SECRET" ]; then
    echo -e "${RED}❌ Failed to get webhook secret${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Webhook secret: $WEBHOOK_SECRET${NC}"

# Create or update .env.local
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}📝 Creating .env.local file...${NC}"
    touch "$ENV_FILE"
fi

# Add or update webhook secret
if grep -q "STRIPE_WEBHOOK_SECRET" "$ENV_FILE"; then
    sed -i.bak "s/STRIPE_WEBHOOK_SECRET=.*/STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET/" "$ENV_FILE"
    rm "$ENV_FILE.bak"
    echo -e "${GREEN}✅ Updated STRIPE_WEBHOOK_SECRET in .env.local${NC}"
else
    echo "STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET" >> "$ENV_FILE"
    echo -e "${GREEN}✅ Added STRIPE_WEBHOOK_SECRET to .env.local${NC}"
fi

# Test the webhook
echo -e "${YELLOW}🧪 Testing webhook endpoint...${NC}"
if curl -s -f "$WEBHOOK_URL" > /dev/null; then
    echo -e "${GREEN}✅ Webhook endpoint is accessible${NC}"
else
    echo -e "${RED}❌ Webhook endpoint is not accessible${NC}"
    echo -e "${YELLOW}💡 Make sure your application is running and the URL is correct${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Stripe webhook setup completed!${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo "   Webhook ID: $WEBHOOK_ID"
echo "   Webhook URL: $WEBHOOK_URL"
echo "   Secret: $WEBHOOK_SECRET"
echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "1. Restart your application to load the new environment variables"
echo "2. Test the webhook with: stripe trigger checkout.session.completed"
echo "3. Monitor webhook events in the Stripe Dashboard"
echo "4. Check your application logs for webhook processing"
echo ""
echo -e "${YELLOW}💡 For development, you can also use:${NC}"
echo "   stripe listen --forward-to localhost:3000/api/webhooks/stripe"
