#!/usr/bin/env python3
"""
Test Google LLC with Residential Proxy and 2captcha
This script tests the complete integration with a real search.
"""

import json
from delaware_lambda_residential_2captcha import lambda_handler

def test_google_llc():
    """Test Google LLC search with residential proxy and 2captcha"""
    
    print("🚀 Testing Google LLC with Residential Proxy + 2captcha")
    print("=" * 60)
    print("⚠️  This is a one-time test to avoid IP bans")
    print()
    
    # Test event
    test_event = {
        'companyName': 'Google LLC',
        'entityType': 'LLC'
    }
    
    try:
        # Run the test
        result = lambda_handler(test_event, None)
        
        print("\n" + "=" * 60)
        print("📊 TEST RESULT:")
        print(f"Status Code: {result.get('statusCode')}")
        
        body = json.loads(result.get('body', '{}'))
        print(f"Success: {body.get('success')}")
        print(f"Available: {body.get('available')}")
        print(f"Message: {body.get('message')}")
        print(f"Method: {body.get('method')}")
        
        if 'existing_entities' in body:
            entities = body['existing_entities']
            print(f"Existing Entities: {len(entities)}")
            for i, entity in enumerate(entities, 1):
                print(f"  {i}. {entity.get('name')} - {entity.get('status')}")
        
        print("\n✅ Test completed!")
        
        return result
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    test_google_llc()
