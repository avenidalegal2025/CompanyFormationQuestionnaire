#!/bin/bash
# Simple test script for Membership Registry generation

export AWS_PROFILE=llc-admin

echo "🔧 Step 1: Updating Lambda layer..."
aws lambda update-function-configuration \
  --function-name MembershipRegistryStack-MembershipRegistryLambda8D-YpxTIUIqd2m2 \
  --layers arn:aws:lambda:us-west-1:043206426879:layer:python-docx-layer:2 \
  --region us-west-1 \
  --output json > /dev/null 2>&1

echo "✅ Layer updated"
echo ""
echo "🧪 Step 2: Testing with Airtable record rec2dFaG8Pes9budh..."
echo ""

cd /Users/rodolfo/company-questionnaire
node scripts/test-membership-registry-direct.js rec2dFaG8Pes9budh
