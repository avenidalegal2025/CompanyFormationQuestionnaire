#!/bin/bash
# Download SS-4 Lambda function code from AWS

LAMBDA_FUNCTION_NAME="ss4-lambda-s3"  # Update with your actual Lambda function name
REGION="us-west-1"
OUTPUT_FILE="lambda-functions/ss4_lambda_s3_aws.py"

echo "📥 Downloading Lambda function: $LAMBDA_FUNCTION_NAME"
echo "📍 Region: $REGION"
echo "💾 Output: $OUTPUT_FILE"

aws lambda get-function \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Code.Location' \
  --output text | xargs curl -o /tmp/lambda.zip

if [ $? -eq 0 ]; then
  echo "✅ Downloaded Lambda code"
  unzip -p /tmp/lambda.zip lambda_function.py > "$OUTPUT_FILE" 2>/dev/null || \
  unzip -p /tmp/lambda.zip *.py | head -n 1000 > "$OUTPUT_FILE"
  
  if [ -f "$OUTPUT_FILE" ]; then
    echo "✅ Extracted to $OUTPUT_FILE"
    echo "📝 Review the file and compare with local version"
  else
    echo "⚠️  Could not extract Python file, checking zip contents..."
    unzip -l /tmp/lambda.zip
  fi
  rm /tmp/lambda.zip
else
  echo "❌ Failed to download Lambda function"
  echo "💡 Make sure AWS CLI is configured and function name is correct"
fi
