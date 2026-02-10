#!/bin/bash
# Deploy DOCX -> PDF conversion Lambda (Python + LibreOffice layer) in us-west-2.
# Uses AWS profile llc-admin by default.

set -e

export AWS_PROFILE="${AWS_PROFILE:-llc-admin}"
REGION="us-west-2"
FUNCTION_NAME="docx-to-pdf-lambda"
RUNTIME="python3.11"
TIMEOUT=60
MEMORY_SIZE=2048
# Public LibreOffice layer (gzip – extracts with Python tarfile, no brotli CLI needed)
LAYER_ARN="arn:aws:lambda:us-west-2:764866452798:layer:libreoffice-gzip:1"

echo "🚀 Deploying $FUNCTION_NAME in $REGION (profile: $AWS_PROFILE)"

cd lambda-functions
zip -q docx-to-pdf-lambda.zip docx_to_pdf_lambda.py
ZIP_PATH="$(pwd)/docx-to-pdf-lambda.zip"

echo "📦 Package: $ZIP_PATH"

# Check if function exists
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "📝 Updating existing function code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --region "$REGION" >/dev/null

  echo "📝 Updating configuration (timeout/memory/layer)..."
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY_SIZE" \
    --layers "$LAYER_ARN" \
    --region "$REGION" >/dev/null
else
  echo "🆕 Creating new function..."
  # Reuse basic lambda-ss4-role or create simple role
  ROLE_NAME="lambda-ss4-role"
  ACCOUNT_ID=$(AWS_PROFILE="$AWS_PROFILE" aws sts get-caller-identity --query Account --output text)
  ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

  if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    echo "⚠️ Role $ROLE_NAME not found, please create or point to an existing Lambda execution role."
    exit 1
  fi

  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --role "$ROLE_ARN" \
    --handler "docx_to_pdf_lambda.lambda_handler" \
    --zip-file "fileb://$ZIP_PATH" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY_SIZE" \
    --layers "$LAYER_ARN" \
    --region "$REGION" >/dev/null
fi

# Create or get Function URL
echo "🔗 Configuring Function URL..."
FUNCTION_URL=$(aws lambda create-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --auth-type NONE \
  --cors '{"AllowOrigins":["*"],"AllowMethods":["POST"],"AllowHeaders":["content-type"]}' \
  --region "$REGION" \
  --query 'FunctionUrl' \
  --output text 2>/dev/null || \
  aws lambda get-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'FunctionUrl' \
    --output text)

cd ..
rm -f lambda-functions/docx-to-pdf-lambda.zip

echo ""
echo "✅ DOCX -> PDF Lambda deployed"
echo "📋 Function Name: $FUNCTION_NAME"
echo "🌎 Region:        $REGION"
echo "🔗 Function URL:  $FUNCTION_URL"
echo ""
echo "➡️  Set this in your env (Vercel):"
echo "   LAMBDA_DOCX_TO_PDF_URL=$FUNCTION_URL"
