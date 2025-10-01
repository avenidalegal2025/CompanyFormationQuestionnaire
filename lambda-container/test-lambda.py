#!/usr/bin/env python3
import json
import boto3

# Test the Lambda function
lambda_client = boto3.client('lambda', region_name='us-west-1')

payload = {
    "companyName": "TEST LLC",
    "entityType": "LLC"
}

response = lambda_client.invoke(
    FunctionName='check-company-availability',
    InvocationType='RequestResponse',
    Payload=json.dumps(payload)
)

result = json.loads(response['Payload'].read())
print(json.dumps(result, indent=2))
