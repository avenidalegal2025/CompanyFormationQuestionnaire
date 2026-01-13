#!/bin/bash
# Deploy Membership Registry Lambda with CDK
# This script creates the Lambda Layer for python-docx, then deploys the stack

set -e

export AWS_PROFILE="${AWS_PROFILE:-llc-admin}"

echo "🚀 Deploying Membership Registry Lambda with CDK"
echo ""

# Step 1: Create Lambda Layer for python-docx and lxml using Docker (Amazon Linux)
echo "📦 Step 1: Creating Lambda Layer for python-docx and lxml (using Docker)..."
LAYER_DIR=$(mktemp -d)
mkdir -p "$LAYER_DIR/python"

# Build layer in Docker container matching Lambda runtime (Amazon Linux 2023)
echo "   Building in Docker container (Amazon Linux 2023)..."
docker run --rm \
  -v "$LAYER_DIR:/var/task" \
  public.ecr.aws/lambda/python:3.11 \
  /bin/bash -c "pip install python-docx lxml -t /var/task/python/ --quiet && chmod -R 755 /var/task/python"

cd "$LAYER_DIR"
zip -r python-docx-layer.zip python/ > /dev/null
cd - > /dev/null

# Check if layer exists
LAYER_NAME="python-docx-layer"
LAYER_VERSION=$(aws lambda list-layer-versions \
    --layer-name "$LAYER_NAME" \
    --region us-west-1 \
    --query 'LayerVersions[0].Version' \
    --output text 2>/dev/null || echo "0")

if [ "$LAYER_VERSION" != "None" ] && [ -n "$LAYER_VERSION" ]; then
    echo "✅ Layer $LAYER_NAME version $LAYER_VERSION already exists"
    echo "   Publishing new version..."
    NEW_VERSION=$(aws lambda publish-layer-version \
        --layer-name "$LAYER_NAME" \
        --zip-file "fileb://$LAYER_DIR/python-docx-layer.zip" \
        --compatible-runtimes python3.11 \
        --region us-west-1 \
        --query 'Version' \
        --output text)
    echo "✅ Published new layer version: $NEW_VERSION"
    LAYER_ARN=$(aws lambda get-layer-version \
        --layer-name "$LAYER_NAME" \
        --version-number "$NEW_VERSION" \
        --region us-west-1 \
        --query 'LayerVersionArn' \
        --output text)
else
    echo "📝 Creating new layer..."
    LAYER_ARN=$(aws lambda publish-layer-version \
        --layer-name "$LAYER_NAME" \
        --zip-file "fileb://$LAYER_DIR/python-docx-layer.zip" \
        --compatible-runtimes python3.11 \
        --region us-west-1 \
        --query 'LayerVersionArn' \
        --output text)
    echo "✅ Created layer: $LAYER_ARN"
fi

# Cleanup
rm -rf "$LAYER_DIR"

# Step 2: Deploy CDK stack with layer
echo ""
echo "🚀 Step 2: Deploying CDK stack with layer..."
cdk deploy --require-approval never \
    -c python-docx-layer-arn="$LAYER_ARN" \
    --outputs-file cdk-outputs.json

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Get the Function URL from cdk-outputs.json or CDK output"
echo "   2. Add to Vercel environment variables:"
echo "      LAMBDA_MEMBERSHIP_REGISTRY_URL=<function-url>"
echo "   3. Redeploy Vercel app"
