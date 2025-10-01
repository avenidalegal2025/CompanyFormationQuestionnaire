#!/bin/bash

# Deploy Lambda function as container image with Firefox

set -e

FUNCTION_NAME="check-company-availability"
REGION="us-west-1"
ROLE_NAME="lambda-sunbiz-checker-role"
HANDLER="check_company_availability.lambda_handler"
MEMORY=1024
TIMEOUT=60
ECR_REPO_NAME="sunbiz-checker"

echo "Building and deploying Lambda container with Firefox..."

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO_NAME}"

echo "Creating ECR repository if it doesn't exist..."
aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $REGION 2>/dev/null || \
aws ecr create-repository --repository-name $ECR_REPO_NAME --region $REGION

echo "Ensuring buildx builder exists..."
docker buildx create --name llcbuilder --use >/dev/null 2>&1 || docker buildx use llcbuilder

echo "Logging in to ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_URI

echo "Building and pushing linux/amd64 image with Docker media type (no provenance)..."
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  --output=type=registry,name=$ECR_URI:latest,push=true,oci-mediatypes=false \
  .

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

# Check if function already exists
FUNCTION_EXISTS=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text 2>/dev/null)

if [ -z "$FUNCTION_EXISTS" ]; then
  echo "Function $FUNCTION_NAME does not exist, creating it..."
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --package-type Image \
    --code ImageUri=$ECR_URI:latest \
    --role $ROLE_ARN \
    --timeout $TIMEOUT \
    --memory-size $MEMORY \
    --region $REGION \
    --architectures x86_64
else
  echo "Function $FUNCTION_NAME already exists, deleting and recreating with container image..."
  aws lambda delete-function --function-name $FUNCTION_NAME --region $REGION
  sleep 5
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --package-type Image \
    --code ImageUri=$ECR_URI:latest \
    --role $ROLE_ARN \
    --timeout $TIMEOUT \
    --memory-size $MEMORY \
    --region $REGION \
    --architectures x86_64
fi

echo "Lambda function deployed successfully!"
echo "Function ARN: $(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)"

echo "Deployment complete!"
