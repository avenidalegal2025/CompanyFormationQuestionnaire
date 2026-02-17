#!/bin/bash
# Build and deploy DOCX->PDF Lambda via CodeBuild using S3 source (no GitHub auth).
# Zips repo, uploads to S3, starts CodeBuild, waits for success.
# Requires: AWS CLI, same account/region as Lambda. Set AWS_PROFILE if needed.

set -e

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION="${AWS_REGION:-us-west-2}"
PROJECT_NAME="docx-to-pdf-lambda-build"
SERVICE_ROLE_NAME="CodeBuild-DocxToPdf-Lambda-Role"
BUCKET="${CODEBUILD_S3_BUCKET:-codebuild-docx-to-pdf-${AWS_ACCOUNT_ID}}"
ZIP_KEY="docx-to-pdf-lambda-source-$(date +%s).zip"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ZIP_PATH="/tmp/docx-to-pdf-codebuild-source.zip"

echo "DOCX->PDF Lambda deploy via CodeBuild (S3 source)"
echo "  Region: $AWS_REGION  Bucket: $BUCKET"

# 1. Ensure S3 bucket exists
aws s3api head-bucket --bucket "$BUCKET" --region "$AWS_REGION" 2>/dev/null || {
  echo "Creating S3 bucket $BUCKET..."
  aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION" --create-bucket-configuration LocationConstraint="$AWS_REGION" 2>/dev/null || \
  aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION"
}

# 2. Ensure ECR repos exist
aws ecr describe-repositories --repository-names docx-to-pdf-lambda --region "$AWS_REGION" 2>/dev/null || \
  aws ecr create-repository --repository-name docx-to-pdf-lambda --region "$AWS_REGION" --output text --query 'repository.repositoryUri'
# Optional: unofunction-libreoffice (create before running scripts/mirror-libreoffice-to-ecr.sh to avoid Docker Hub rate limit)
aws ecr describe-repositories --repository-names unofunction-libreoffice --region "$AWS_REGION" 2>/dev/null || \
  aws ecr create-repository --repository-name unofunction-libreoffice --region "$AWS_REGION" --output text --query 'repository.repositoryUri'

# 2b. Lambda execution role (for container image) with ECR pull + basic execution
LAMBDA_ROLE_NAME="lambda-docx-to-pdf-execution-role"
aws iam create-role --role-name "$LAMBDA_ROLE_NAME" --assume-role-policy-document '{
  "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Principal": { "Service": "lambda.amazonaws.com" }, "Action": "sts:AssumeRole" }]
}' 2>/dev/null || true
aws iam attach-role-policy --role-name "$LAMBDA_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true
aws iam put-role-policy --role-name "$LAMBDA_ROLE_NAME" --policy-name "ECR-Pull" --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    { \"Effect\": \"Allow\", \"Action\": \"ecr:GetAuthorizationToken\", \"Resource\": \"*\" },
    { \"Effect\": \"Allow\", \"Action\": [\"ecr:GetDownloadUrlForLayer\", \"ecr:BatchGetImage\"], \"Resource\": \"arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/docx-to-pdf-lambda\" }
  ]
}" 2>/dev/null || true
# ECR repository policy: allow Lambda execution role to pull
aws ecr set-repository-policy --repository-name docx-to-pdf-lambda --region "$AWS_REGION" --policy-text "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"AllowLambdaPull\",
    \"Effect\": \"Allow\",
    \"Principal\": { \"AWS\": \"arn:aws:iam::${AWS_ACCOUNT_ID}:role/${LAMBDA_ROLE_NAME}\" },
    \"Action\": [\"ecr:GetDownloadUrlForLayer\", \"ecr:BatchGetImage\"]
  }]
}" 2>/dev/null || true
echo "Waiting for IAM/ECR propagation..."
sleep 15
LAMBDA_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${LAMBDA_ROLE_NAME}"

# 3. Allow CodeBuild role to read from this bucket (inline policy)
POLICY_NAME="CodeBuild-S3-Source-Access"
aws iam put-role-policy \
  --role-name "$SERVICE_ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:GetObject\", \"s3:GetObjectVersion\"],
      \"Resource\": \"arn:aws:s3:::${BUCKET}/*\"
    }]
  }" 2>/dev/null || true

# 4. Zip source (buildspec + lambda-functions needed for Docker build)
echo "Zipping source..."
(cd "$REPO_ROOT" && zip -q -r "$ZIP_PATH" buildspec-docx-to-pdf-lambda.yml lambda-functions/Dockerfile.docx-to-pdf lambda-functions/docx_to_pdf_lambda.py)

# 5. Upload
echo "Uploading to s3://$BUCKET/$ZIP_KEY..."
aws s3 cp "$ZIP_PATH" "s3://$BUCKET/$ZIP_KEY" --region "$AWS_REGION"
rm -f "$ZIP_PATH"

# 6. Start build with S3 source override (no GitHub auth)
echo "Starting CodeBuild..."
BUILD_ID=$(aws codebuild start-build \
  --project-name "$PROJECT_NAME" \
  --region "$AWS_REGION" \
  --source-type-override S3 \
  --source-location-override "$BUCKET/$ZIP_KEY" \
  --buildspec-override "buildspec-docx-to-pdf-lambda.yml" \
  --environment-variables-override "name=LAMBDA_ROLE_ARN,value=$LAMBDA_ROLE_ARN,type=PLAINTEXT" \
  --query 'build.id' \
  --output text)

echo ""
echo "Build ID: $BUILD_ID"
echo "Console:  https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/projects/$PROJECT_NAME/build/$BUILD_ID"
echo ""
echo "Waiting for build to complete (this may take 8–15 min)..."
while true; do
  STATUS=$(aws codebuild batch-get-builds --ids "$BUILD_ID" --region "$AWS_REGION" --query 'builds[0].buildStatus' --output text)
  PHASE=$(aws codebuild batch-get-builds --ids "$BUILD_ID" --region "$AWS_REGION" --query 'builds[0].currentPhase' --output text)
  echo "  $PHASE -> $STATUS"
  if [ "$STATUS" = "SUCCEEDED" ]; then
    echo ""
    ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/docx-to-pdf-lambda:latest"
    if ! aws lambda get-function --function-name docx-to-pdf-lambda --region "$AWS_REGION" &>/dev/null; then
      echo "Creating Lambda function (container image)..."
      aws lambda create-function --function-name docx-to-pdf-lambda --package-type Image --code "ImageUri=$ECR_URI" --role "$LAMBDA_ROLE_ARN" --timeout 90 --memory-size 3008 --region "$AWS_REGION" --output text --query FunctionName
    else
      echo "Lambda function already exists."
    fi
    echo "DOCX-to-PDF Lambda container deployed. Run: npx ts-node --project tsconfig.scripts.json scripts/qa-docx-to-pdf.ts"
    exit 0
  fi
  if [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "FAULT" ] || [ "$STATUS" = "STOPPED" ] || [ "$STATUS" = "TIMED_OUT" ]; then
    echo ""
    echo "Build failed: $STATUS. Check CloudWatch: /aws/codebuild/$PROJECT_NAME"
    exit 1
  fi
  sleep 30
done
