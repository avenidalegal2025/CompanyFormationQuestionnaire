# Membership Registry Lambda CDK Stack

This CDK stack deploys the Membership Registry Lambda function that generates filled Word documents from templates.

## Prerequisites

1. AWS CDK CLI installed:
   ```bash
   npm install -g aws-cdk
   ```

2. Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. AWS credentials configured (profile `llc-admin`)

## Deployment

1. **Bootstrap CDK** (first time only):
   ```bash
   cdk bootstrap aws://043206426879/us-west-1
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Create Lambda Layer for python-docx** (required dependency):
   ```bash
   # Create a directory for the layer
   mkdir -p layer/python
   pip install python-docx -t layer/python/
   zip -r python-docx-layer.zip layer/
   
   # Create the layer in AWS
   aws lambda publish-layer-version \
     --layer-name python-docx-layer \
     --zip-file fileb://python-docx-layer.zip \
     --compatible-runtimes python3.11 \
     --region us-west-1
   ```

4. **Deploy the stack**:
   ```bash
   export AWS_PROFILE=llc-admin
   cdk deploy
   ```

5. **Get the Function URL**:
   After deployment, the Function URL will be displayed in the outputs. Copy it and add to Vercel:
   ```
   LAMBDA_MEMBERSHIP_REGISTRY_URL=<function-url>
   ```

## Stack Outputs

- `FunctionUrl`: The Lambda Function URL for calling the API
- `FunctionName`: The Lambda function name
- `FunctionArn`: The Lambda function ARN

## Updating the Lambda

To update the Lambda code:

1. Make changes to `../lambda-functions/membership-registry-lambda.py`
2. Run `cdk deploy` again

## Destroying the Stack

```bash
cdk destroy
```
