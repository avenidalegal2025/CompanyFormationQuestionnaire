#!/bin/bash
# Deploy Membership Registry Lambda Function
# Prefer the production (CDK-deployed) Lambda so Vercel keeps using the same URL.
# Uses AWS profile llc-admin (same as other Lambda deploy scripts).

set -e

export AWS_PROFILE="${AWS_PROFILE:-llc-admin}"

REGION="us-west-1"
ROLE_NAME="lambda-ss4-role"
HANDLER="membership-registry-lambda.lambda_handler"
RUNTIME="python3.11"
TIMEOUT=300
MEMORY_SIZE=512

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LAMBDA_DIR="$REPO_ROOT/lambda-functions"

# Prefer CDK stack function name (production Lambda used by Vercel)
CDK_OUTPUTS="$REPO_ROOT/membership-registry-cdk/cdk-outputs.json"
if [ -f "$CDK_OUTPUTS" ]; then
  FUNCTION_NAME=$(grep -o '"FunctionName":"[^"]*"' "$CDK_OUTPUTS" | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
fi
if [ -z "$FUNCTION_NAME" ]; then
  FUNCTION_NAME="membership-registry-lambda"
fi

echo "🚀 Deploying Membership Registry Lambda Function..."
echo "Function Name: $FUNCTION_NAME"
echo "Region: $REGION"
echo ""

cd "$LAMBDA_DIR" || exit 1

# CDK function uses a layer (python-docx); only deploy handler. Standalone needs full package.
USE_HANDLER_ONLY=false
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  LAYERS=$(aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Layers' --output text 2>/dev/null || true)
  if [ -n "$LAYERS" ] && [ "$LAYERS" != "None" ]; then
    USE_HANDLER_ONLY=true
  fi
fi

if [ "$USE_HANDLER_ONLY" = true ]; then
  echo "📦 Creating handler-only package (CDK function uses layer)..."
  zip -q -j membership-registry-handler.zip membership-registry-lambda.py
  DEPLOYMENT_PACKAGE="$(pwd)/membership-registry-handler.zip"
else
  echo "📦 Creating full deployment package..."
  mkdir -p package
  pip install python-docx boto3 -t package/ --platform manylinux2014_x86_64 --only-binary=:all: 2>&1 | grep -v "already satisfied" || true
  cp membership-registry-lambda.py package/
  cd package
  zip -r ../membership-registry-lambda.zip . > /dev/null
  cd ..
  DEPLOYMENT_PACKAGE="$(pwd)/membership-registry-lambda.zip"
fi
echo "✅ Package created: $DEPLOYMENT_PACKAGE"

FUNCTION_EXISTS=false
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  FUNCTION_EXISTS=true
fi

if [ "$FUNCTION_EXISTS" = true ]; then
  echo "📝 Updating existing function (production Lambda)..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$DEPLOYMENT_PACKAGE" \
    --region "$REGION"

  if [ "$USE_HANDLER_ONLY" != true ]; then
    aws lambda update-function-configuration \
      --function-name "$FUNCTION_NAME" \
      --timeout $TIMEOUT \
      --memory-size $MEMORY_SIZE \
      --environment "Variables={TEMPLATE_BUCKET=company-formation-template-llc-and-inc,OUTPUT_BUCKET=avenida-legal-documents,BUCKET_NAME=company-formation-template-llc-and-inc}" \
      --region "$REGION" > /dev/null
  fi
  echo "✅ Function updated"
else
  echo "🔍 Getting IAM role..."
  ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null || echo "")
  if [ -z "$ROLE_ARN" ]; then
    echo "⚠️  Role $ROLE_NAME not found. Creating new role..."
    aws iam create-role \
      --role-name membership-registry-lambda-role \
      --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Principal": {"Service": "lambda.amazonaws.com"},
          "Action": "sts:AssumeRole"
        }]
      }' > /dev/null
    aws iam attach-role-policy \
      --role-name membership-registry-lambda-role \
      --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    aws iam put-role-policy \
      --role-name membership-registry-lambda-role \
      --policy-name S3Access \
      --policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Action": ["s3:GetObject", "s3:PutObject"],
          "Resource": [
            "arn:aws:s3:::company-formation-template-llc-and-inc/*",
            "arn:aws:s3:::avenida-legal-documents/*"
          ]
        }]
      }'
    ROLE_ARN=$(aws iam get-role --role-name membership-registry-lambda-role --query 'Role.Arn' --output text)
    echo "✅ Created role: $ROLE_ARN"
  else
    echo "✅ Using existing role: $ROLE_ARN"
  fi

  echo "🆕 Creating new function..."
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime $RUNTIME \
    --role "$ROLE_ARN" \
    --handler $HANDLER \
    --zip-file "fileb://$DEPLOYMENT_PACKAGE" \
    --timeout $TIMEOUT \
    --memory-size $MEMORY_SIZE \
    --environment "Variables={TEMPLATE_BUCKET=company-formation-template-llc-and-inc,OUTPUT_BUCKET=avenida-legal-documents,BUCKET_NAME=company-formation-template-llc-and-inc}" \
    --region "$REGION" > /dev/null
  echo "✅ Function created"
fi

echo "🔗 Function URL..."
FUNCTION_URL=$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" --query 'FunctionUrl' --output text 2>/dev/null || \
  aws lambda create-function-url-config \
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

echo ""
echo "✅ Lambda Function Deployed!"
echo "📋 Function Name: $FUNCTION_NAME"
echo "🔗 Function URL: $FUNCTION_URL"
echo ""

# Cleanup
rm -f membership-registry-handler.zip
rm -rf package membership-registry-lambda.zip
cd ..
