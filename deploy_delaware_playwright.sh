#!/bin/bash

# Variables
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_DEFAULT_REGION="us-west-1"
IMAGE_REPO_NAME="delaware-playwright-lambda"
IMAGE_TAG="latest"
LAMBDA_FUNCTION_NAME="delaware-playwright-lambda"

echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_DEFAULT_REGION"
echo "ECR Repository Name: $IMAGE_REPO_NAME"
echo "Lambda Function Name: $LAMBDA_FUNCTION_NAME"

# 1. Create ECR repository if it doesn't exist
echo "Checking for ECR repository: $IMAGE_REPO_NAME"
aws ecr describe-repositories --repository-names $IMAGE_REPO_NAME --region $AWS_DEFAULT_REGION >/dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Repository does not exist. Creating $IMAGE_REPO_NAME..."
  aws ecr create-repository \
    --repository-name $IMAGE_REPO_NAME \
    --image-tag-mutability MUTABLE \
    --image-scanning-configuration scanOnPush=true \
    --region $AWS_DEFAULT_REGION
  if [ $? -ne 0 ]; then
    echo "Failed to create ECR repository."
    exit 1
  fi
else
  echo "Repository $IMAGE_REPO_NAME already exists."
fi

# 2. Copy the Playwright Lambda function to simple_lambda.py for Docker build
echo "Copying delaware_lambda_playwright.py to simple_lambda.py..."
cp delaware_lambda_playwright.py simple_lambda.py
if [ $? -ne 0 ]; then
  echo "Failed to copy lambda file."
  exit 1
fi

# 3. Build and deploy
echo "Building Docker image for Delaware Playwright..."
aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com

docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG -f Dockerfile-playwright .
if [ $? -ne 0 ]; then
  echo "Docker build failed."
  exit 1
fi

docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG

echo "Pushing the Docker image..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
if [ $? -ne 0 ]; then
  echo "Docker push failed."
  exit 1
fi

echo "Creating/updating Lambda function..."
# Check if Lambda function exists
if aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --region $AWS_DEFAULT_REGION >/dev/null 2>&1; then
  echo "Updating existing Lambda function..."
  aws lambda update-function-code \
    --function-name $LAMBDA_FUNCTION_NAME \
    --image-uri $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG \
    --region $AWS_DEFAULT_REGION
else
  echo "Creating new Lambda function..."
  # Create IAM role for Lambda if it doesn't exist
  aws iam get-role --role-name lambda-delaware-playwright-role >/dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "Creating IAM role lambda-delaware-playwright-role..."
    aws iam create-role --role-name lambda-delaware-playwright-role --assume-role-policy-document '{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Principal": { "Service": "lambda.amazonaws.com" }, "Action": "sts:AssumeRole" } ] }'
    aws iam attach-role-policy --role-name lambda-delaware-playwright-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    aws iam attach-role-policy --role-name lambda-delaware-playwright-role --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
    sleep 10 # Give IAM time to propagate
  else
    echo "IAM role lambda-delaware-playwright-role already exists."
  fi

  aws lambda create-function \
    --function-name $LAMBDA_FUNCTION_NAME \
    --package-type Image \
    --code ImageUri=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG \
    --role arn:aws:iam::$AWS_ACCOUNT_ID:role/lambda-delaware-playwright-role \
    --timeout 300 \
    --memory-size 2048 \
    --region $AWS_DEFAULT_REGION
fi

echo "Lambda function deployment completed!"
echo "Deployment script finished."
