#!/bin/bash
# Create (if needed) and start AWS CodeBuild for Membership Registry Lambda full deploy.
# Deploys layer + CDK stack so you don't need Docker locally.
# Ensure code is pushed to GitHub first; CodeBuild will clone and run buildspec-membership-registry-deploy.yml

set -e

AWS_REGION="${AWS_REGION:-us-west-1}"
PROJECT_NAME="${CODEBUILD_PROJECT_NAME:-membership-registry-deploy}"
# Repo: https://github.com/avenidalegal2025/CompanyFormationQuestionnaire
GITHUB_LOCATION="${GITHUB_LOCATION:-https://github.com/avenidalegal2025/CompanyFormationQuestionnaire.git}"
BUILDSPEC="${BUILDSPEC:-buildspec-membership-registry-deploy.yml}"
SERVICE_ROLE_NAME="CodeBuild-Membership-Registry-Deploy-Role"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "AWS Account: $AWS_ACCOUNT_ID"
echo "Region:      $AWS_REGION"
echo "Project:     $PROJECT_NAME"
echo "Source:      $GITHUB_LOCATION"
echo "Buildspec:   $BUILDSPEC"
echo ""

# Create IAM role for CodeBuild if not exists
echo "Ensuring IAM role $SERVICE_ROLE_NAME..."
aws iam create-role \
  --role-name "$SERVICE_ROLE_NAME" \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "codebuild.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }' 2>/dev/null || true

aws iam attach-role-policy --role-name "$SERVICE_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name "$SERVICE_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name "$SERVICE_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || true
aws iam attach-role-policy --role-name "$SERVICE_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/IAMFullAccess 2>/dev/null || true

# CDK needs CloudFormation
aws iam attach-role-policy --role-name "$SERVICE_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess 2>/dev/null || true

echo "Creating or updating CodeBuild project..."
aws codebuild create-project \
  --name "$PROJECT_NAME" \
  --description "Deploy Membership Registry Lambda (layer + CDK)" \
  --service-role "arn:aws:iam::${AWS_ACCOUNT_ID}:role/${SERVICE_ROLE_NAME}" \
  --artifacts type=NO_ARTIFACTS \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=false,imagePullCredentialsType=CODEBUILD \
  --source type=GITHUB,location="$GITHUB_LOCATION",buildspec="$BUILDSPEC" \
  --logs-config '{"cloudWatchLogs":{"status":"ENABLED"}}' \
  --region "$AWS_REGION" 2>/dev/null || \
aws codebuild update-project \
  --name "$PROJECT_NAME" \
  --description "Deploy Membership Registry Lambda (layer + CDK)" \
  --service-role "arn:aws:iam::${AWS_ACCOUNT_ID}:role/${SERVICE_ROLE_NAME}" \
  --artifacts type=NO_ARTIFACTS \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=false,imagePullCredentialsType=CODEBUILD \
  --source type=GITHUB,location="$GITHUB_LOCATION",buildspec="$BUILDSPEC" \
  --logs-config '{"cloudWatchLogs":{"status":"ENABLED"}}' \
  --region "$AWS_REGION"

echo ""
echo "Starting build..."
BUILD_ID=$(aws codebuild start-build --project-name "$PROJECT_NAME" --region "$AWS_REGION" --query 'build.id' --output text)
echo "Build ID: $BUILD_ID"
echo "Console:  https://${AWS_REGION}.console.aws.amazon.com/codesuite/codebuild/projects/${PROJECT_NAME}/build/${BUILD_ID}"
echo ""
echo "Wait for SUCCEEDED then regenerate formation docs to verify."
