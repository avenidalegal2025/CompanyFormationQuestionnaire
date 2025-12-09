#!/bin/bash

# Script to manually generate SS-4 for an Airtable record
# Usage: ./generate-ss4-for-record.sh recXXXXXXXXXXXXXX

RECORD_ID=$1

if [ -z "$RECORD_ID" ]; then
  echo "❌ Error: Please provide an Airtable Record ID"
  echo "Usage: ./generate-ss4-for-record.sh recXXXXXXXXXXXXXX"
  exit 1
fi

# Get the Vercel URL from environment or use default
VERCEL_URL=${VERCEL_URL:-"company-formation-questionnaire.vercel.app"}
API_URL="https://${VERCEL_URL}/api/airtable/generate-ss4"

echo "📋 Generating SS-4 for Airtable Record: $RECORD_ID"
echo "🔗 API URL: $API_URL"
echo ""

# Call the API
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{\"recordId\": \"$RECORD_ID\", \"updateAirtable\": true}")

# Split response and status code
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "📡 Response Status: $http_code"
echo ""

if [ "$http_code" -eq 200 ]; then
  echo "✅ SS-4 generated successfully!"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo "❌ Failed to generate SS-4"
  echo "$body"
fi

