#!/usr/bin/env python3
"""
Extended test script for Delaware name search with more realistic company names
"""

import json
import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from delaware_lambda import lambda_handler

def test_delaware_search_extended():
    """Test the Delaware name search with more realistic company names"""
    
    test_cases = [
        {
            "companyName": "Apple Inc",
            "entityType": "CORP",
            "description": "Test with well-known company name"
        },
        {
            "companyName": "Microsoft Corporation",
            "entityType": "CORP", 
            "description": "Test with another well-known company"
        },
        {
            "companyName": "Delaware Holdings LLC",
            "entityType": "LLC",
            "description": "Test with Delaware in name"
        },
        {
            "companyName": "Test123 Holdings",
            "entityType": "LLC",
            "description": "Test with numbers in name"
        },
        {
            "companyName": "Unique Company Name XYZ",
            "entityType": "LLC",
            "description": "Test with unique name"
        }
    ]
    
    print("Extended Delaware Name Search Test")
    print("=" * 50)
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\nTest Case {i}: {test_case['description']}")
        print(f"Company Name: {test_case['companyName']}")
        print(f"Entity Type: {test_case['entityType']}")
        print("-" * 40)
        
        try:
            # Create event for lambda handler
            event = {
                "companyName": test_case["companyName"],
                "entityType": test_case["entityType"]
            }
            
            # Call the lambda handler
            result = lambda_handler(event, None)
            
            print(f"Status Code: {result['statusCode']}")
            
            # Parse the body
            body = json.loads(result['body'])
            print(f"Success: {body.get('success', 'N/A')}")
            print(f"Available: {body.get('available', 'N/A')}")
            print(f"Message: {body.get('message', 'N/A')}")
            print(f"Method: {body.get('method', 'N/A')}")
            
            if 'existing_entities' in body and body['existing_entities']:
                print(f"Existing Entities: {len(body['existing_entities'])} found")
                for entity in body['existing_entities']:
                    print(f"  - {entity.get('name', 'N/A')} ({entity.get('status', 'N/A')})")
            else:
                print("Existing Entities: None")
                
        except Exception as e:
            print(f"Error: {str(e)}")
        
        print()

if __name__ == "__main__":
    test_delaware_search_extended()
