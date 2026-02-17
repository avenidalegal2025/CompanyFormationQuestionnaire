#!/bin/bash
# One-time: pull unofunction/libreoffice from Docker Hub and push to your ECR.
# Run when Docker is available so CodeBuild can use the ECR image and avoid Docker Hub rate limit.
# Usage: AWS_PROFILE=llc-admin ./scripts/mirror-libreoffice-to-ecr.sh

set -e

AWS_PROFILE="${AWS_PROFILE:-llc-admin}"
REGION="${AWS_REGION:-us-west-2}"
REPO="unofunction-libreoffice"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}:latest"

echo "Creating ECR repository $REPO if needed..."
aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" 2>/dev/null || \
  aws ecr create-repository --repository-name "$REPO" --region "$REGION" --output text --query 'repository.repositoryUri'

echo "Logging in to ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "Pulling unofunction/libreoffice (may be slow)..."
docker pull --platform linux/amd64 unofunction/libreoffice:latest

echo "Tagging and pushing to $ECR_URI..."
docker tag unofunction/libreoffice:latest "$ECR_URI"
docker push "$ECR_URI"

echo "Done. CodeBuild will use $ECR_URI for the DOCX-to-PDF Lambda build."
