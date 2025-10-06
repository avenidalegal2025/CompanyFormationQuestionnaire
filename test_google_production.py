#!/usr/bin/env python3
"""
Single Test: Google LLC with Production Version
This script tests Google LLC once with the production-grade anti-detection system.
"""

import json
from delaware_lambda_production import lambda_handler

def test_google_llc_production():
    """Test Google LLC search with production-grade anti-detection"""
    
    print("🚀 Testing Google LLC with Production-Grade Anti-Detection")
    print("=" * 70)
    print("⚠️  This is a one-time test to avoid IP bans")
    print("🏠 Using ScrapeOps residential proxies")
    print("🧩 2captcha integration enabled")
    print("🛡️  Advanced anti-detection enabled")
    print()
    
    # Test event
    test_event = {
        'companyName': 'Google LLC',
        'entityType': 'LLC'
    }
    
    try:
        # Run the test
        result = lambda_handler(test_event, None)
        
        print("\n" + "=" * 70)
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
    test_google_llc_production()
