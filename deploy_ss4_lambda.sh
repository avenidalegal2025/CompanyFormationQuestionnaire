#!/bin/bash

# Deploy SS-4 Lambda Function
# This script packages and deploys the SS-4 Lambda function to AWS

set -e

# Use llc-admin profile for Avenida Legal LLC
export AWS_PROFILE="${AWS_PROFILE:-llc-admin}"

FUNCTION_NAME="${SS4_LAMBDA_NAME:-ss4-lambda-s3-complete}"
REGION="${AWS_REGION:-us-west-1}"
RUNTIME="python3.9"
HANDLER="ss4_lambda_s3_complete.lambda_handler"
TIMEOUT=300
MEMORY_SIZE=512
ROLE_NAME="${LAMBDA_ROLE_NAME:-lambda-ss4-role}"

echo "🚀 Deploying SS-4 Lambda Function..."
echo "Function Name: $FUNCTION_NAME"
echo "Region: $REGION"
echo ""

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
echo "📦 Creating deployment package in $TEMP_DIR..."

# Copy Lambda function
cp lambda-functions/ss4_lambda_s3_complete.py "$TEMP_DIR/"

# Install dependencies
echo "📥 Installing dependencies (reportlab, PyPDF2, typing_extensions)..."
cd "$TEMP_DIR"
# Install reportlab, PyPDF2, and typing_extensions (needed by PyPDF2)
pip install reportlab PyPDF2 typing_extensions -t . --quiet
# Remove PIL/Pillow completely - reportlab can work without it for basic PDF text generation
# Pillow causes import errors in Lambda runtime (needs compiled C extensions for _imaging)
echo "🧹 Removing PIL/Pillow (not needed for text-only PDF generation)..."
rm -rf PIL/ Pillow*.dist-info 2>/dev/null || true
# Create a stub PIL module to prevent import errors
mkdir -p PIL
cat > PIL/__init__.py << 'PILEOF'
# Stub PIL module - reportlab doesn't need it for text-only PDFs
# This prevents import errors when reportlab tries to import PIL
PIL_VERSION = "1.0.0"
PILEOF
cat > PIL/Image.py << 'PILEOF'
# Stub PIL.Image module
class Image:
    pass
PILEOF

# Create zip file
ZIP_FILE="/tmp/ss4-lambda-deployment.zip"
echo "📦 Creating zip file..."
zip -r "$ZIP_FILE" . -q

# Get zip file size
ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
echo "✅ Package created: $ZIP_FILE ($ZIP_SIZE)"
echo ""

# Clean up temp directory
cd - > /dev/null
rm -rf "$TEMP_DIR"

# Get Google Maps API key from environment or prompt
GOOGLE_MAPS_API_KEY="${GOOGLE_MAPS_API_KEY:-${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:-}}"
if [ -z "$GOOGLE_MAPS_API_KEY" ]; then
    echo "⚠️  Warning: GOOGLE_MAPS_API_KEY not set in environment"
    echo "   The Lambda will work but Google Maps API fallback for county lookup will be disabled"
    echo "   Set GOOGLE_MAPS_API_KEY environment variable to enable it"
    GOOGLE_MAPS_API_KEY=""
fi

# Check if function exists
echo "🔍 Checking if Lambda function exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "🔄 Updating existing Lambda function..."
    
    # Update function code
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file "fileb://$ZIP_FILE" \
        --region "$REGION" \
        --output json | jq -r '.FunctionArn'
    
    echo ""
    echo "⏳ Waiting for update to complete..."
    aws lambda wait function-updated \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION"
    
    # Update environment variables (including Google Maps API key if provided)
    if [ -n "$GOOGLE_MAPS_API_KEY" ]; then
        echo "🔧 Updating environment variables (including Google Maps API key)..."
        ENV_VARS="BUCKET_NAME=ss4-template-bucket-043206426879,OUTPUT_BUCKET=avenida-legal-documents,GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY"
    else
        echo "🔧 Updating environment variables (without Google Maps API key)..."
        ENV_VARS="BUCKET_NAME=ss4-template-bucket-043206426879,OUTPUT_BUCKET=avenida-legal-documents"
    fi
    
    aws lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --environment "Variables={$ENV_VARS}" \
        --output json > /dev/null
    
    echo "✅ Lambda function updated successfully!"
else
    echo "📝 Function does not exist. Creating new Lambda function..."
    
    # Get or create IAM role
    echo "🔐 Setting up IAM role..."
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
    
    # Check if role exists
    if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
        echo "✅ IAM role $ROLE_NAME already exists"
    else
        echo "📝 Creating IAM role $ROLE_NAME..."
        
        # Create trust policy
        cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
        
        # Create role
        aws iam create-role \
            --role-name "$ROLE_NAME" \
            --assume-role-policy-document file:///tmp/trust-policy.json \
            --description "Role for SS-4 Lambda function" \
            --output json > /dev/null
        
        # Attach basic execution policy
        aws iam attach-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
        
        # Attach S3 access policy and Translate permissions (inline policy)
        cat > /tmp/s3-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::ss4-template-bucket-043206426879/*",
        "arn:aws:s3:::avenida-legal-documents/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "translate:TranslateText"
      ],
      "Resource": "*"
    }
  ]
}
EOF
        
        aws iam put-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-name SS4S3Access \
            --policy-document file:///tmp/s3-policy.json
        
        echo "✅ IAM role created. Waiting for propagation..."
        sleep 10
    fi
    
    # Create Lambda function
    echo "📦 Creating Lambda function..."
    aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime "$RUNTIME" \
        --role "$ROLE_ARN" \
        --handler "$HANDLER" \
        --zip-file "fileb://$ZIP_FILE" \
        --timeout "$TIMEOUT" \
        --memory-size "$MEMORY_SIZE" \
        --region "$REGION" \
        --description "SS-4 EIN Application PDF Generator" \
        --environment "Variables={BUCKET_NAME=ss4-template-bucket-043206426879,OUTPUT_BUCKET=avenida-legal-documents$(if [ -n "$GOOGLE_MAPS_API_KEY" ]; then echo ",GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY"; fi)}" \
        --output json | jq -r '.FunctionArn'
    
    echo "✅ Lambda function created successfully!"
    
    # Clean up temp files
    rm -f /tmp/trust-policy.json /tmp/s3-policy.json
fi

# Create or update Function URL (for both new and existing functions)
echo ""
echo "🔗 Setting up Function URL..."
if aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "🔄 Updating existing Function URL..."
    aws lambda update-function-url-config \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --auth-type NONE \
        --cors '{"AllowOrigins":["*"],"AllowMethods":["POST","GET"],"AllowHeaders":["*"]}' \
        --output json > /dev/null
else
    echo "📝 Creating Function URL..."
    aws lambda create-function-url-config \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --auth-type NONE \
        --cors '{"AllowOrigins":["*"],"AllowMethods":["POST","GET"],"AllowHeaders":["*"]}' \
        --output json > /dev/null
fi

# Get Function URL
FUNCTION_URL=$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" --query 'FunctionUrl' --output text 2>/dev/null || echo "")
if [ -n "$FUNCTION_URL" ]; then
    echo "✅ Function URL: $FUNCTION_URL"
fi

echo ""
echo "✅ Deployment completed!"
echo ""
echo "📋 Function Details:"
aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.[FunctionName,FunctionArn,Runtime,LastModified]' --output table

echo ""
echo "🧪 To test the function, use:"
echo "aws lambda invoke \\"
echo "    --function-name $FUNCTION_NAME \\"
echo "    --region $REGION \\"
echo "    --payload '{\"form_data\":{\"companyName\":\"Test Company LLC\"},\"s3_bucket\":\"test-bucket\",\"s3_key\":\"test.pdf\",\"templateUrl\":\"https://example.com/template.pdf\"}' \\"
echo "    response.json"

