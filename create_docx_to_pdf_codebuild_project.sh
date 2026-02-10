#!/bin/bash
# Create CodeBuild project for DOCX->PDF Lambda container (unofunction LibreOffice), then start build.
# No local Docker required; build runs in AWS. Lambda/ECR in us-west-2.

set -e

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION="${AWS_REGION:-us-west-2}"
PROJECT_NAME="docx-to-pdf-lambda-build"
SERVICE_ROLE_NAME="CodeBuild-DocxToPdf-Lambda-Role"
GITHUB_LOCATION="${GITHUB_LOCATION:-https://github.com/rodolfo/company-questionnaire.git}"

echo "Creating CodeBuild project for DOCX->PDF Lambda (container)..."
echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "AWS Region:     $AWS_REGION"
echo "Source:         $GITHUB_LOCATION"

# 1. IAM role for CodeBuild
echo "Creating IAM role..."
aws iam create-role \
  --role-name $SERVICE_ROLE_NAME \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": { "Service": "codebuild.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }
    ]
  }' 2>/dev/null || echo "Role already exists"

echo "Attaching policies..."
aws iam attach-role-policy \
  --role-name $SERVICE_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess 2>/dev/null || true
aws iam attach-role-policy \
  --role-name $SERVICE_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser 2>/dev/null || true
aws iam attach-role-policy \
  --role-name $SERVICE_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess 2>/dev/null || true

# Allow IAM to propagate
echo "Waiting for IAM role to be usable..."
sleep 10

# 2. Create or update CodeBuild project (us-west-2, privileged for Docker)
echo "Creating CodeBuild project..."
aws codebuild create-project \
  --name $PROJECT_NAME \
  --description "Build DOCX->PDF Lambda container (unofunction LibreOffice) and deploy to ECR + Lambda" \
  --service-role arn:aws:iam::$AWS_ACCOUNT_ID:role/$SERVICE_ROLE_NAME \
  --artifacts type=NO_ARTIFACTS \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true \
  --source type=GITHUB,location="$GITHUB_LOCATION",buildspec=buildspec-docx-to-pdf-lambda.yml \
  --logs-config '{"cloudWatchLogs":{"status":"ENABLED"}}' \
  --region $AWS_REGION 2>/dev/null || true

# Update if project already exists (source/buildspec might have changed)
aws codebuild update-project \
  --name $PROJECT_NAME \
  --description "Build DOCX->PDF Lambda container (unofunction LibreOffice) and deploy to ECR + Lambda" \
  --service-role arn:aws:iam::$AWS_ACCOUNT_ID:role/$SERVICE_ROLE_NAME \
  --artifacts type=NO_ARTIFACTS \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true \
  --source type=GITHUB,location="$GITHUB_LOCATION",buildspec=buildspec-docx-to-pdf-lambda.yml \
  --logs-config '{"cloudWatchLogs":{"status":"ENABLED"}}' \
  --region $AWS_REGION --output text --query project.name

# 3. Start build
echo "Starting build..."
BUILD_ID=$(aws codebuild start-build \
  --project-name $PROJECT_NAME \
  --region $AWS_REGION \
  --query 'build.id' \
  --output text)

echo ""
echo "Build started: $BUILD_ID"
echo "Monitor: https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/projects/$PROJECT_NAME/build/$BUILD_ID"
echo ""
echo "Waiting for build to complete..."
aws codebuild batch-get-builds --ids $BUILD_ID --region $AWS_REGION --query 'builds[0].{status:buildStatus,phase:currentPhase}' --output table
echo "Run: aws codebuild batch-get-builds --ids $BUILD_ID --region $AWS_REGION --query 'builds[0].buildStatus' --output text"
echo "When SUCCEEDED, run: npx ts-node --project tsconfig.scripts.json scripts/qa-docx-to-pdf.ts"
