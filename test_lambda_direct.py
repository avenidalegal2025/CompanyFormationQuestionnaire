#!/usr/bin/env python3

import boto3
import json
import base64

def test_lambda():
    lambda_client = boto3.client('lambda', region_name='us-west-1')
    
    # Test payload
    payload = {
        "companyName": "Google LLC",
        "entityType": "LLC"
    }
    
    print("Testing Delaware Lambda function...")
    print(f"Payload: {payload}")
    
    try:
        response = lambda_client.invoke(
            FunctionName='delaware-playwright-lambda',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        print(f"Status Code: {response['StatusCode']}")
        
        # Read the response
        response_payload = json.loads(response['Payload'].read())
        print(f"Response: {json.dumps(response_payload, indent=2)}")
        
        # Check for errors
        if 'FunctionError' in response:
            print(f"Function Error: {response['FunctionError']}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_lambda()
