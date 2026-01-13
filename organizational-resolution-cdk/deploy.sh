#!/bin/bash
# Deploy Organizational Resolution Lambda with CDK
# Reuses the existing python-docx layer from membership registry

set -e

export AWS_PROFILE="${AWS_PROFILE:-llc-admin}"

echo "🚀 Deploying Organizational Resolution Lambda with CDK"
echo ""

# Get the existing python-docx layer ARN (from membership registry)
LAYER_ARN=$(aws lambda list-layer-versions \
    --layer-name python-docx-layer \
    --region us-west-1 \
    --query 'LayerVersions[0].LayerVersionArn' \
    --output text 2>/dev/null || echo "")

if [ -z "$LAYER_ARN" ] || [ "$LAYER_ARN" == "None" ]; then
    echo "❌ python-docx layer not found. Please deploy membership-registry-cdk first."
    exit 1
fi

echo "✅ Using existing layer: $LAYER_ARN"
echo ""

# Deploy CDK stack with layer
echo "🚀 Deploying CDK stack with layer..."
cdk deploy --require-approval never \
    -c python-docx-layer-arn="$LAYER_ARN" \
    --outputs-file cdk-outputs.json

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Get the Function URL from cdk-outputs.json or CDK output"
echo "   2. Add to Vercel environment variables:"
echo "      LAMBDA_ORGANIZATIONAL_RESOLUTION_URL=<function-url>"
echo "   3. Redeploy Vercel app"
