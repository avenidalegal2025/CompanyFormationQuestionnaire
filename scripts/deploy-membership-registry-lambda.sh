#!/bin/bash
# Deploy Membership Registry Lambda Function

set -e

FUNCTION_NAME="membership-registry-lambda"
REGION="us-west-1"
ROLE_NAME="lambda-ss4-role"  # Reuse existing role or create new one
HANDLER="membership-registry-lambda.lambda_handler"
RUNTIME="python3.11"
TIMEOUT=300
MEMORY_SIZE=512

echo "🚀 Deploying Membership Registry Lambda Function..."
echo "Function Name: $FUNCTION_NAME"
echo "Region: $REGION"
echo ""

# Create deployment package
echo "📦 Creating deployment package..."
cd lambda-functions
mkdir -p package
pip install python-docx boto3 -t package/ --platform manylinux2014_x86_64 --only-binary=:all: 2>&1 | grep -v "already satisfied" || true
cp membership-registry-lambda.py package/
cd package
zip -r ../membership-registry-lambda.zip . > /dev/null
cd ..
DEPLOYMENT_PACKAGE="$(pwd)/membership-registry-lambda.zip"
echo "✅ Package created: $DEPLOYMENT_PACKAGE"

# Get IAM role ARN
echo "🔍 Getting IAM role..."
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [ -z "$ROLE_ARN" ]; then
    echo "⚠️  Role $ROLE_NAME not found. Creating new role..."
    # Create basic Lambda execution role
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
    
    # Attach basic execution policy
    aws iam attach-role-policy \
        --role-name membership-registry-lambda-role \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    
    # Add S3 permissions
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

# Check if function exists
echo "🔍 Checking if function exists..."
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION > /dev/null 2>&1; then
    echo "📝 Updating existing function..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file "fileb://$DEPLOYMENT_PACKAGE" \
        --region $REGION > /dev/null
    
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout $TIMEOUT \
        --memory-size $MEMORY_SIZE \
        --environment "Variables={TEMPLATE_BUCKET=company-formation-template-llc-and-inc,OUTPUT_BUCKET=avenida-legal-documents,BUCKET_NAME=company-formation-template-llc-and-inc}" \
        --region $REGION > /dev/null
    
    echo "✅ Function updated"
else
    echo "🆕 Creating new function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime $RUNTIME \
        --role $ROLE_ARN \
        --handler $HANDLER \
        --zip-file "fileb://$DEPLOYMENT_PACKAGE" \
        --timeout $TIMEOUT \
        --memory-size $MEMORY_SIZE \
        --environment "Variables={TEMPLATE_BUCKET=company-formation-template-llc-and-inc,OUTPUT_BUCKET=avenida-legal-documents,BUCKET_NAME=company-formation-template-llc-and-inc}" \
        --region $REGION > /dev/null
    
    echo "✅ Function created"
fi

# Create Function URL
echo "🔗 Creating Function URL..."
FUNCTION_URL=$(aws lambda create-function-url-config \
    --function-name $FUNCTION_NAME \
    --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["POST"],"AllowHeaders":["content-type"]}' \
    --region $REGION \
    --query 'FunctionUrl' \
    --output text 2>/dev/null || \
    aws lambda get-function-url-config \
        --function-name $FUNCTION_NAME \
        --region $REGION \
        --query 'FunctionUrl' \
        --output text)

echo ""
echo "✅ Lambda Function Deployed!"
echo "📋 Function Name: $FUNCTION_NAME"
echo "🔗 Function URL: $FUNCTION_URL"
echo ""
echo "📝 Next steps:"
echo "   1. Add to Vercel environment variables:"
echo "      LAMBDA_MEMBERSHIP_REGISTRY_URL=$FUNCTION_URL"
echo "   2. Redeploy your Vercel app"
echo ""

# Cleanup
rm -rf package membership-registry-lambda.zip
cd ..
