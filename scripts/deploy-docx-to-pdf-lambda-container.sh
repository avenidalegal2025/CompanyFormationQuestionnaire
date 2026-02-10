#!/bin/bash
# Deploy DOCX->PDF Lambda as a CONTAINER IMAGE using unofunction's LibreOffice.
# The shelfio layer triggers NoSuchElementException; this image uses a known-good LO build.
# Requires: Docker running, AWS CLI, profile with ECR + Lambda permissions.
#
# Usage: ./scripts/deploy-docx-to-pdf-lambda-container.sh

set -e

export AWS_PROFILE="${AWS_PROFILE:-llc-admin}"
REGION="us-west-2"
FUNCTION_NAME="docx-to-pdf-lambda"
IMAGE_NAME="docx-to-pdf-lambda"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${IMAGE_NAME}:latest"

echo "🚀 Building and deploying $FUNCTION_NAME as container (unofunction LibreOffice) in $REGION"

# ECR repo
aws ecr describe-repositories --repository-names "$IMAGE_NAME" --region "$REGION" 2>/dev/null || \
  aws ecr create-repository --repository-name "$IMAGE_NAME" --region "$REGION" --output text --query 'repository.repositoryUri'

# Login
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Build (from repo root so Dockerfile can COPY from lambda-functions/)
cd "$(dirname "$0")/.."
docker build -f lambda-functions/Dockerfile.docx-to-pdf -t "$IMAGE_NAME:latest" lambda-functions/
docker tag "$IMAGE_NAME:latest" "$ECR_URI"
docker push "$ECR_URI"

# Update Lambda to use the image (must already exist as zip; we switch to image)
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --image-uri "$ECR_URI" \
  --region "$REGION" \
  --output text --query 'LastUpdateStatus'

aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --memory-size 3008 \
  --timeout 90 \
  --region "$REGION" \
  --output text --query 'FunctionName' >/dev/null

echo ""
echo "✅ Container Lambda deployed. Run: npx ts-node --project tsconfig.scripts.json scripts/qa-docx-to-pdf.ts"
echo "   Image: $ECR_URI"
