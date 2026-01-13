#!/bin/bash

# Create AWS CodeBuild project for Membership Registry Lambda layer (python-docx + lxml)

set -e

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION="us-west-1"
PROJECT_NAME="membership-registry-layer-build"
SERVICE_ROLE_NAME="CodeBuild-Membership-Registry-Role"

echo "Creating CodeBuild project for Membership Registry Lambda layer..."
echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"

# 1. Create IAM role for CodeBuild
echo "Creating IAM role for CodeBuild (if not exists)..."
aws iam create-role \
  --role-name $SERVICE_ROLE_NAME \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Service": "codebuild.amazonaws.com"
        },
        "Action": "sts:AssumeRole"
      }
    ]
  }' 2>/dev/null || echo "Role already exists"

# 2. Attach policies to the role
echo "Attaching policies to CodeBuild role..."
aws iam attach-role-policy \
  --role-name $SERVICE_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess 2>/dev/null || echo "CloudWatch policy already attached"

aws iam attach-role-policy \
  --role-name $SERVICE_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AWSLambdaFullAccess 2>/dev/null || echo "Lambda policy already attached"

aws iam attach-role-policy \
  --role-name $SERVICE_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || echo "S3 policy already attached"

# 3. Create CodeBuild project
echo "Creating CodeBuild project (if not exists)..."
aws codebuild create-project \
  --name $PROJECT_NAME \
  --description "Build Lambda layer for Membership Registry (python-docx + lxml) and attach to Lambda" \
  --service-role arn:aws:iam::$AWS_ACCOUNT_ID:role/$SERVICE_ROLE_NAME \
  --artifacts type=NO_ARTIFACTS \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=false \
  --source type=GITHUB,location=https://github.com/rodolfo/company-questionnaire.git,buildspec=buildspec-membership-registry-layer.yml \
  --logs-config cloudWatchLogs=status=ENABLED \
  --region $AWS_REGION 2>/dev/null || echo "Project already exists"

# 4. Start the build
echo "Starting CodeBuild project..."
BUILD_ID=$(aws codebuild start-build \
  --project-name $PROJECT_NAME \
  --region $AWS_REGION \
  --query 'build.id' \
  --output text)

echo "Build started with ID: $BUILD_ID"
echo "You can monitor the build at: https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/projects/$PROJECT_NAME/build/$BUILD_ID"

# 5. Optionally wait for build to complete
echo "Waiting for build to complete..."
STATUS=$(aws codebuild batch-get-builds \
  --ids $BUILD_ID \
  --region $AWS_REGION \
  --query 'builds[0].buildStatus' \
  --output text)

echo "Build status: $STATUS"
echo "If SUCCESS, Lambda function should now be using the new python-docx + lxml layer."

