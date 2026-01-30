#!/usr/bin/env python3
"""Update Lambda function to use layer version 2"""

import boto3
import sys

lambda_client = boto3.client('lambda', region_name='us-west-1')

function_name = 'MembershipRegistryStack-MembershipRegistryLambda8D-YpxTIUIqd2m2'
layer_arn = 'arn:aws:lambda:us-west-1:043206426879:layer:python-docx-layer:2'

try:
    response = lambda_client.update_function_configuration(
        FunctionName=function_name,
        Layers=[layer_arn]
    )
    print(f"✅ Lambda layer updated successfully!")
    print(f"   Function: {function_name}")
    print(f"   Layer: {layer_arn}")
    print(f"   Status: {response['State']}")
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
