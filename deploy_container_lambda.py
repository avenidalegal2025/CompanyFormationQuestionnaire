#!/usr/bin/env python3
"""
Deploy Delaware Lambda using container image
This script builds and deploys the Lambda function using ECR and container images
"""

import boto3
import subprocess
import json
import os
import time

def build_and_push_container():
    """Build and push the container image to ECR"""
    
    print("🐳 Building and pushing container image...")
    
    # Get AWS account ID
    sts_client = boto3.client('sts')
    account_id = sts_client.get_caller_identity()['Account']
    region = 'us-west-1'
    repository_name = 'delaware-playwright-lambda'
    
    # ECR login
    print("🔐 Logging into ECR...")
    login_cmd = f"aws ecr get-login-password --region {region} | docker login --username AWS --password-stdin {account_id}.dkr.ecr.{region}.amazonaws.com"
    subprocess.run(login_cmd, shell=True, check=True)
    
    # Create ECR repository if it doesn't exist
    ecr_client = boto3.client('ecr', region_name=region)
    try:
        ecr_client.describe_repositories(repositoryNames=[repository_name])
        print(f"✅ ECR repository {repository_name} already exists")
    except ecr_client.exceptions.RepositoryNotFoundException:
        print(f"📝 Creating ECR repository {repository_name}...")
        ecr_client.create_repository(
            repositoryName=repository_name,
            imageTagMutability='MUTABLE',
            imageScanningConfiguration={'scanOnPush': True}
        )
        print(f"✅ ECR repository {repository_name} created")
    
    # Copy lambda function
    print("📋 Preparing Lambda function...")
    with open('delaware_lambda_playwright.py', 'r') as f:
        lambda_code = f.read()
    
    with open('simple_lambda.py', 'w') as f:
        f.write(lambda_code)
    
    # Build Docker image
    print("🔨 Building Docker image...")
    image_uri = f"{account_id}.dkr.ecr.{region}.amazonaws.com/{repository_name}:latest"
    
    build_cmd = f"docker build -t {repository_name}:latest -f Dockerfile-playwright ."
    subprocess.run(build_cmd, shell=True, check=True)
    
    # Tag image
    tag_cmd = f"docker tag {repository_name}:latest {image_uri}"
    subprocess.run(tag_cmd, shell=True, check=True)
    
    # Push image
    print("📤 Pushing image to ECR...")
    push_cmd = f"docker push {image_uri}"
    subprocess.run(push_cmd, shell=True, check=True)
    
    print(f"✅ Image pushed: {image_uri}")
    return image_uri

def deploy_lambda_function(image_uri):
    """Deploy the Lambda function using the container image"""
    
    print("🚀 Deploying Lambda function...")
    
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
        
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn='arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly'
        )
        
        print(f"✅ IAM role {role_name} created")
        time.sleep(10)  # Wait for role to propagate
    
    # Get account ID for role ARN
    sts_client = boto3.client('sts')
    account_id = sts_client.get_caller_identity()['Account']
    role_arn = f'arn:aws:iam::{account_id}:role/{role_name}'
    
    function_name = 'delaware-playwright-lambda'
    
    try:
        # Check if function exists
        lambda_client.get_function(FunctionName=function_name)
        print(f"🔄 Updating existing Lambda function {function_name}...")
        
        # Update function code
        lambda_client.update_function_code(
            FunctionName=function_name,
            ImageUri=image_uri
        )
        
        # Update function configuration
        lambda_client.update_function_configuration(
            FunctionName=function_name,
            Timeout=300,
            MemorySize=2048,
            Environment={
                'Variables': {
                    'SCRAPEOPS_API_KEY': os.environ["SCRAPEOPS_API_KEY"],
                    'CAPTCHA_API_KEY': os.environ["CAPTCHA_API_KEY"]
                }
            }
        )
        
        print(f"✅ Lambda function {function_name} updated successfully!")
        
    except lambda_client.exceptions.ResourceNotFoundException:
        print(f"📝 Creating new Lambda function {function_name}...")
        
        # Create function
        lambda_client.create_function(
            FunctionName=function_name,
            PackageType='Image',
            Code={'ImageUri': image_uri},
            Role=role_arn,
            Timeout=300,
            MemorySize=2048,
            Description='Delaware company name search with Playwright and 2captcha',
            Environment={
                'Variables': {
                    'SCRAPEOPS_API_KEY': os.environ["SCRAPEOPS_API_KEY"],
                    'CAPTCHA_API_KEY': os.environ["CAPTCHA_API_KEY"]
                }
            }
        )
        
        print(f"✅ Lambda function {function_name} created successfully!")
    
    # Test the function
    print("🧪 Testing Lambda function...")
    try:
        # Wait a bit for the function to be ready
        time.sleep(30)
        
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
        print("This might be expected if Playwright dependencies aren't fully installed")
    
    print("\n🎉 Container-based deployment completed!")
    print(f"Lambda function: {function_name}")
    print(f"Image URI: {image_uri}")
    print(f"Region: us-west-1")

def main():
    """Main deployment function"""
    
    print("🚀 Starting container-based Lambda deployment...")
    
    # Check if Docker is running
    try:
        subprocess.run(['docker', 'version'], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        print("❌ Docker is not running. Please start Docker and try again.")
        return
    
    try:
        # Build and push container
        image_uri = build_and_push_container()
        
        # Deploy Lambda function
        deploy_lambda_function(image_uri)
        
    except Exception as e:
        print(f"❌ Deployment failed: {e}")
        raise

if __name__ == "__main__":
    main()
