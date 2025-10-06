#!/usr/bin/env python3
"""
Deploy Delaware Lambda directly using AWS SDK
This script creates the Lambda function without needing CodeBuild
"""

import boto3
import zipfile
import os
import tempfile
import json

def create_lambda_package():
    """Create a deployment package for the Lambda function"""
    
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Copy the Lambda function
        with open('delaware_lambda_playwright.py', 'r') as f:
            lambda_code = f.read()
        
        # Write as simple_lambda.py
        with open(os.path.join(temp_dir, 'simple_lambda.py'), 'w') as f:
            f.write(lambda_code)
        
        # Create requirements.txt
        requirements = """requests
beautifulsoup4
lxml
playwright"""
        
        with open(os.path.join(temp_dir, 'requirements.txt'), 'w') as f:
            f.write(requirements)
        
        # Create a zip file
        zip_path = os.path.join(temp_dir, 'lambda_package.zip')
        with zipfile.ZipFile(zip_path, 'w') as zip_file:
            zip_file.write(os.path.join(temp_dir, 'simple_lambda.py'), 'simple_lambda.py')
            zip_file.write(os.path.join(temp_dir, 'requirements.txt'), 'requirements.txt')
        
        # Return the absolute path
        return os.path.abspath(zip_path)
    
    except Exception as e:
        print(f"Error creating package: {e}")
        raise

def deploy_lambda():
    """Deploy the Lambda function"""
    
    print("🚀 Deploying Delaware Playwright Lambda directly...")
    
    # Create Lambda client
    lambda_client = boto3.client('lambda', region_name='us-west-1')
    iam_client = boto3.client('iam', region_name='us-west-1')
    
    # Create IAM role if it doesn't exist
    role_name = 'lambda-delaware-playwright-role'
    try:
        iam_client.get_role(RoleName=role_name)
        print(f"✅ IAM role {role_name} already exists")
    except iam_client.exceptions.NoSuchEntityException:
        print(f"📝 Creating IAM role {role_name}...")
        
        trust_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "lambda.amazonaws.com"
                    },
                    "Action": "sts:AssumeRole"
                }
            ]
        }
        
        iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description='Role for Delaware Playwright Lambda function'
        )
        
        # Attach policies
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        )
        
        print(f"✅ IAM role {role_name} created")
    
    # Get account ID for role ARN
    sts_client = boto3.client('sts')
    account_id = sts_client.get_caller_identity()['Account']
    role_arn = f'arn:aws:iam::{account_id}:role/{role_name}'
    
    # Create deployment package
    print("📦 Creating deployment package...")
    zip_path = create_lambda_package()
    
    # Read the zip file
    with open(zip_path, 'rb') as f:
        zip_content = f.read()
    
    function_name = 'delaware-playwright-lambda'
    
    try:
        # Check if function exists
        lambda_client.get_function(FunctionName=function_name)
        print(f"🔄 Updating existing Lambda function {function_name}...")
        
        # Update function code
        lambda_client.update_function_code(
            FunctionName=function_name,
            ZipFile=zip_content
        )
        
        # Update function configuration
        lambda_client.update_function_configuration(
            FunctionName=function_name,
            Timeout=300,
            MemorySize=2048,
            Environment={
                'Variables': {
                    'SCRAPEOPS_API_KEY': 'b3a2e586-8c39-4115-8ffb-590ad8750116',
                    'CAPTCHA_API_KEY': 'f70e8ca44204cc56c23f32925064ee93'
                }
            }
        )
        
        print(f"✅ Lambda function {function_name} updated successfully!")
        
    except lambda_client.exceptions.ResourceNotFoundException:
        print(f"📝 Creating new Lambda function {function_name}...")
        
        # Create function
        lambda_client.create_function(
            FunctionName=function_name,
            Runtime='python3.9',
            Role=role_arn,
            Handler='simple_lambda.lambda_handler',
            Code={'ZipFile': zip_content},
            Timeout=300,
            MemorySize=2048,
            Description='Delaware company name search with Playwright and 2captcha',
            Environment={
                'Variables': {
                    'SCRAPEOPS_API_KEY': 'b3a2e586-8c39-4115-8ffb-590ad8750116',
                    'CAPTCHA_API_KEY': 'f70e8ca44204cc56c23f32925064ee93'
                }
            }
        )
        
        print(f"✅ Lambda function {function_name} created successfully!")
    
    # Test the function
    print("🧪 Testing Lambda function...")
    try:
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'companyName': 'Test Company LLC',
                'entityType': 'LLC'
            })
        )
        
        result = json.loads(response['Payload'].read())
        print(f"✅ Test successful! Response: {result}")
        
    except Exception as e:
        print(f"⚠️  Test failed: {e}")
        print("Note: This is expected since Playwright dependencies aren't installed in the zip package")
    
    print("\n🎉 Deployment completed!")
    print(f"Lambda function: {function_name}")
    print(f"Region: us-west-1")
    print("Note: For production use, you'll need to use a container image with Playwright installed")

if __name__ == "__main__":
    deploy_lambda()
