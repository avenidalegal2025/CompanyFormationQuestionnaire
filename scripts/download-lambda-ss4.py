#!/usr/bin/env python3
"""
Download SS-4 Lambda function code from AWS Lambda
This allows you to sync the deployed version with your local code
"""
import boto3
import json
import os
import sys

# Lambda function name
LAMBDA_FUNCTION_NAME = os.environ.get('LAMBDA_SS4_FUNCTION_NAME', 'ss4-lambda-s3')
AWS_REGION = os.environ.get('AWS_REGION', 'us-west-1')

def download_lambda_code(function_name, output_file):
    """Download Lambda function code from AWS"""
    print(f"📥 Downloading Lambda function: {function_name}")
    print(f"📍 Region: {AWS_REGION}")
    
    try:
        lambda_client = boto3.client('lambda', region_name=AWS_REGION)
        
        # Get function configuration
        print(f"🔍 Fetching function configuration...")
        response = lambda_client.get_function(FunctionName=function_name)
        
        code_location = response['Code']['Location']
        print(f"✅ Found function at: {code_location}")
        
        # Download the code
        import urllib.request
        print(f"📥 Downloading code package...")
        urllib.request.urlretrieve(code_location, output_file)
        
        print(f"✅ Downloaded to: {output_file}")
        print(f"📦 File size: {os.path.getsize(output_file)} bytes")
        
        # Also get the function code directly (if it's inline)
        try:
            code_response = lambda_client.get_function_code_signing_config(FunctionName=function_name)
            print(f"📋 Code signing config: {code_response}")
        except:
            pass
        
        # Get the actual code (if it's a small function, it might be inline)
        try:
            code = response.get('Code', {})
            if 'ZipFile' in code:
                print("⚠️ Function code is inline (too small to download separately)")
                with open(output_file, 'wb') as f:
                    f.write(code['ZipFile'])
        except:
            pass
        
        return True
        
    except lambda_client.exceptions.ResourceNotFoundException:
        print(f"❌ Function '{function_name}' not found")
        print(f"💡 Available functions in region {AWS_REGION}:")
        try:
            functions = lambda_client.list_functions()
            for func in functions.get('Functions', []):
                print(f"   - {func['FunctionName']}")
        except:
            pass
        return False
        
    except Exception as e:
        print(f"❌ Error downloading Lambda function: {e}")
        return False

def extract_code_from_zip(zip_file, output_dir):
    """Extract Python code from Lambda deployment package"""
    import zipfile
    import os
    
    print(f"📦 Extracting {zip_file}...")
    os.makedirs(output_dir, exist_ok=True)
    
    with zipfile.ZipFile(zip_file, 'r') as zip_ref:
        zip_ref.extractall(output_dir)
        print(f"✅ Extracted to: {output_dir}")
        
        # List Python files
        python_files = [f for f in zip_ref.namelist() if f.endswith('.py')]
        if python_files:
            print(f"📄 Python files found:")
            for f in python_files:
                print(f"   - {f}")

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Download SS-4 Lambda function from AWS')
    parser.add_argument('--function-name', default=LAMBDA_FUNCTION_NAME,
                       help='Lambda function name (default: from env or ss4-lambda-s3)')
    parser.add_argument('--region', default=AWS_REGION,
                       help='AWS region (default: us-west-1)')
    parser.add_argument('--output', default='lambda-ss4-downloaded.zip',
                       help='Output zip file (default: lambda-ss4-downloaded.zip)')
    parser.add_argument('--extract', action='store_true',
                       help='Extract the zip file after downloading')
    parser.add_argument('--extract-dir', default='lambda-ss4-extracted',
                       help='Directory to extract to (default: lambda-ss4-extracted)')
    
    args = parser.parse_args()
    
    # Override with args
    LAMBDA_FUNCTION_NAME = args.function_name
    AWS_REGION = args.region
    
    success = download_lambda_code(LAMBDA_FUNCTION_NAME, args.output)
    
    if success and args.extract:
        extract_code_from_zip(args.output, args.extract_dir)
        print(f"\n✅ Code downloaded and extracted!")
        print(f"📁 Review the code in: {args.extract_dir}/")
    elif success:
        print(f"\n✅ Code downloaded!")
        print(f"📦 Zip file: {args.output}")
        print(f"💡 Run with --extract to extract the files")
    
    sys.exit(0 if success else 1)

