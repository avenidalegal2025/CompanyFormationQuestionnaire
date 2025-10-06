#!/bin/bash

# Delaware Lambda Deployment Script with ScrapeOps
# This script deploys the Delaware name search Lambda function with ScrapeOps proxy integration

set -e

# Configuration
AWS_REGION="us-east-1"  # Change to your preferred region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
IMAGE_REPO_NAME="delaware-scrapeops-lambda"
IMAGE_TAG="latest"
LAMBDA_FUNCTION_NAME="delaware-name-search-scrapeops"

echo "🚀 Deploying Delaware Lambda with ScrapeOps Integration"
echo "=================================================="
echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"
echo "Image Repository: $IMAGE_REPO_NAME"
echo "Lambda Function: $LAMBDA_FUNCTION_NAME"
echo ""

# Step 1: Create ECR repository if it doesn't exist
echo "📦 Creating ECR repository..."
aws ecr describe-repositories --repository-names $IMAGE_REPO_NAME --region $AWS_REGION >/dev/null 2>&1 || \
aws ecr create-repository --repository-name $IMAGE_REPO_NAME --region $AWS_REGION

# Step 2: Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Step 3: Build Docker image
echo "🔨 Building Docker image..."
docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG -f Dockerfile-scrapeops .

# Step 4: Tag image for ECR
echo "🏷️  Tagging image for ECR..."
docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG

# Step 5: Push image to ECR
echo "📤 Pushing image to ECR..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG

# Step 6: Create or update Lambda function
echo "⚡ Creating/updating Lambda function..."

# Check if function exists
if aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION >/dev/null 2>&1; then
    echo "📝 Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name $LAMBDA_FUNCTION_NAME \
        --image-uri $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG \
        --region $AWS_REGION
else
    echo "🆕 Creating new Lambda function..."
    
    # Create IAM role
    echo "👤 Creating IAM role..."
    aws iam create-role \
        --role-name lambda-delaware-scrapeops-role \
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
    
    # Attach policies
    echo "🔗 Attaching policies..."
    aws iam attach-role-policy \
        --role-name lambda-delaware-scrapeops-role \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || echo "Basic Execution Policy already attached"
    
    aws iam attach-role-policy \
        --role-name lambda-delaware-scrapeops-role \
        --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly 2>/dev/null || echo "ECR ReadOnly Policy already attached"
    
    # Wait for role to be ready
    echo "⏳ Waiting for IAM role to be ready..."
    sleep 10
    
    # Create Lambda function
    aws lambda create-function \
        --function-name $LAMBDA_FUNCTION_NAME \
        --package-type Image \
        --code ImageUri=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG \
        --role arn:aws:iam::$AWS_ACCOUNT_ID:role/lambda-delaware-scrapeops-role \
        --timeout 300 \
        --memory-size 2048 \
        --region $AWS_REGION
fi

# Step 7: Test the function
echo "🧪 Testing Lambda function..."
aws lambda invoke \
    --function-name $LAMBDA_FUNCTION_NAME \
    --payload '{"companyName": "Test Company LLC", "entityType": "LLC"}' \
    --region $AWS_REGION \
    response.json

echo ""
echo "📊 Test Response:"
cat response.json | jq '.'

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "🔗 Lambda Function ARN:"
aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION --query 'Configuration.FunctionArn' --output text

echo ""
echo "📋 Next Steps:"
echo "1. Test the function with different company names"
echo "2. Set up API Gateway if needed"
echo "3. Configure monitoring and logging"
echo "4. Set up environment variables if needed"
