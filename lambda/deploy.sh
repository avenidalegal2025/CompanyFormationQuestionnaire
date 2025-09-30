#!/bin/bash

# Deploy Lambda function for company name availability checking
# This script packages the Lambda function with dependencies

set -e

FUNCTION_NAME="check-company-availability"
REGION="us-west-1"
ROLE_NAME="lambda-sunbiz-checker-role"

echo "Building Lambda deployment package..."

# Create deployment directory
mkdir -p deployment
cd deployment

# Install dependencies
pip install -r ../requirements.txt -t .

# Copy the Lambda function
cp ../check_company_availability.py .

# Create deployment package
zip -r function.zip .

echo "Creating IAM role for Lambda function..."

# Create IAM role (if it doesn't exist)
aws iam create-role \
    --role-name $ROLE_NAME \
    --assume-role-policy-document '{
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
    }' 2>/dev/null || echo "Role already exists"

# Attach basic execution policy
aws iam attach-role-policy \
    --role-name $ROLE_NAME \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Wait for role to be ready
sleep 10

# Get the role ARN
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)

echo "Deploying Lambda function..."

# Create or update the Lambda function
aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime python3.9 \
    --role $ROLE_ARN \
    --handler check_company_availability.lambda_handler \
    --zip-file fileb://function.zip \
    --timeout 60 \
    --memory-size 512 \
    --region $REGION \
    2>/dev/null || \
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://function.zip \
    --region $REGION

echo "Lambda function deployed successfully!"
echo "Function ARN: $(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)"

# Clean up
cd ..
rm -rf deployment

echo "Deployment complete!"
