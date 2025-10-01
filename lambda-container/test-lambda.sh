#!/bin/bash
cd /Users/rodolfo/company-questionnaire/lambda-container

# Create a proper JSON payload
cat > test-payload.json << EOF
{"companyName":"TEST LLC","entityType":"LLC"}
EOF

# Test the Lambda function
echo "Testing Lambda function..."
aws lambda invoke \
  --function-name check-company-availability \
  --payload file://test-payload.json \
  --region us-west-1 \
  --profile llc-admin \
  response.json

echo "Response:"
cat response.json | jq .

# Clean up
rm -f test-payload.json response.json
