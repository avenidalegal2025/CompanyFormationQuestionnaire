#!/bin/bash
# Deploy Ensure Airtable Fields Lambda and run it so AWS creates missing Airtable fields.
# Requires AIRTABLE_BASE_ID and AIRTABLE_API_KEY (from Airtable → Create token, Base ID from URL).

set -e

export AWS_PROFILE="${AWS_PROFILE:-llc-admin}"

if [ -z "$AIRTABLE_BASE_ID" ] || [ -z "$AIRTABLE_API_KEY" ]; then
  echo "❌ Set Airtable credentials:"
  echo "   export AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX"
  echo "   export AIRTABLE_API_KEY=patXXXXXXXXXXXX"
  echo "   (Base ID from Airtable URL; token from https://airtable.com/create/tokens with schema.bases:read, schema.bases:write)"
  exit 1
fi

echo "🚀 Deploying Ensure Airtable Fields Lambda..."
cdk deploy --require-approval never \
  -c airtable_base_id="$AIRTABLE_BASE_ID" \
  -c airtable_api_key="$AIRTABLE_API_KEY"

echo ""
echo "✅ Deploy complete. Invoking Lambda to create any missing fields..."
FUN=$(aws cloudformation describe-stacks --stack-name AirtableFieldsStack --query 'Stacks[0].Outputs[?OutputKey==`FunctionName`].OutputValue' --output text --region us-west-1 2>/dev/null || true)
if [ -z "$FUN" ]; then
  FUN=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName,'AirtableFieldsStack')].FunctionName" --output text --region us-west-1 | tr '\t' '\n' | head -1)
fi
if [ -n "$FUN" ]; then
  aws lambda invoke --function-name "$FUN" --region us-west-1 out.json
  echo ""
  echo "Lambda response:"
  cat out.json | python3 -m json.tool
  rm -f out.json
  echo ""
  echo "✅ Airtable Formations table now has all required document URL fields."
else
  echo "⚠️  Could not resolve function name. Invoke manually:"
  echo "   aws cloudformation describe-stacks --stack-name AirtableFieldsStack --query 'Stacks[0].Outputs' --region us-west-1"
  echo "   aws lambda invoke --function-name <FunctionName> --region us-west-1 out.json && cat out.json"
fi
