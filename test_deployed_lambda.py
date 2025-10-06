#!/usr/bin/env python3
"""
Test Deployed Lambda Function
This script tests the deployed Delaware Lambda function with ScrapeOps integration.
"""

import boto3
import json
import time

# Configuration
AWS_REGION = "us-east-1"  # Change to your region
LAMBDA_FUNCTION_NAME = "delaware-name-search-scrapeops"

def test_lambda_function(company_name, entity_type="LLC"):
    """Test the deployed Lambda function"""
    
    print(f"🧪 Testing Lambda function for: {company_name}")
    print("=" * 50)
    
    try:
        # Create Lambda client
        lambda_client = boto3.client('lambda', region_name=AWS_REGION)
        
        # Prepare test event
        test_event = {
            'companyName': company_name,
            'entityType': entity_type
        }
        
        print(f"📤 Invoking Lambda function...")
        start_time = time.time()
        
        # Invoke the function
        response = lambda_client.invoke(
            FunctionName=LAMBDA_FUNCTION_NAME,
            InvocationType='RequestResponse',
            Payload=json.dumps(test_event)
        )
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Parse response
        response_payload = json.loads(response['Payload'].read())
        
        print(f"⏱️  Duration: {duration:.2f} seconds")
        print(f"📊 Status Code: {response['StatusCode']}")
        
        if response['StatusCode'] == 200:
            result = json.loads(response_payload['body'])
            print(f"✅ Success: {result.get('success')}")
            print(f"📋 Available: {result.get('available')}")
            print(f"💬 Message: {result.get('message')}")
            print(f"🔧 Method: {result.get('method')}")
            print(f"📝 Existing Entities: {len(result.get('existing_entities', []))}")
            
            if result.get('existing_entities'):
                print("   Found entities:")
                for entity in result['existing_entities']:
                    print(f"     - {entity['name']} ({entity['status']})")
            
            return True
        else:
            print(f"❌ Error: {response_payload}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_multiple_companies():
    """Test multiple company names"""
    
    print("🚀 Testing Deployed Delaware Lambda Function")
    print("=" * 60)
    
    test_companies = [
        ("Test Company LLC", "LLC"),
        ("Google LLC", "LLC"),
        ("Apple Inc", "CORP"),
        ("Microsoft Corporation", "CORP"),
        ("Delaware Holdings LLC", "LLC")
    ]
    
    results = []
    
    for company_name, entity_type in test_companies:
        print(f"\n{'='*60}")
        success = test_lambda_function(company_name, entity_type)
        results.append((company_name, success))
        
        # Add delay between tests
        time.sleep(2)
    
    # Summary
    print(f"\n📊 Test Summary")
    print("=" * 30)
    successful_tests = sum(1 for _, success in results if success)
    total_tests = len(results)
    
    for company_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {company_name}")
    
    print(f"\n🎯 Overall: {successful_tests}/{total_tests} tests passed")
    
    if successful_tests == total_tests:
        print("🎉 All tests passed! Lambda function is working perfectly!")
    else:
        print("⚠️  Some tests failed. Check the logs for details.")

def get_lambda_info():
    """Get information about the deployed Lambda function"""
    
    try:
        lambda_client = boto3.client('lambda', region_name=AWS_REGION)
        
        response = lambda_client.get_function(FunctionName=LAMBDA_FUNCTION_NAME)
        config = response['Configuration']
        
        print("📋 Lambda Function Information")
        print("=" * 40)
        print(f"Function Name: {config['FunctionName']}")
        print(f"Function ARN: {config['FunctionArn']}")
        print(f"Runtime: {config.get('Runtime', 'Container')}")
        print(f"Memory Size: {config['MemorySize']} MB")
        print(f"Timeout: {config['Timeout']} seconds")
        print(f"Last Modified: {config['LastModified']}")
        print(f"State: {config['State']}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error getting Lambda info: {e}")
        return False

def main():
    """Main test function"""
    
    print("🔍 Delaware Lambda Function Test Suite")
    print("=" * 60)
    
    # Check if Lambda function exists
    if not get_lambda_info():
        print(f"❌ Lambda function '{LAMBDA_FUNCTION_NAME}' not found!")
        print("Please deploy the function first using deploy_scrapeops.sh")
        return
    
    print("")
    
    # Test the function
    test_multiple_companies()

if __name__ == "__main__":
    main()
