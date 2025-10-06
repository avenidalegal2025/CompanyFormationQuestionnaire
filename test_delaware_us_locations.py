#!/usr/bin/env python3
"""
Test script to demonstrate US-focused geographic rotation for Delaware search
"""

import json
import sys
import os
import random

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from delaware_lambda_proxy import create_advanced_session, get_geographic_headers, GEO_LOCATIONS

def test_us_geographic_rotation():
    """Test the US-focused geographic rotation"""
    
    print("🇺🇸 Testing US Geographic Rotation for Delaware Search")
    print("=" * 60)
    
    # Test different US locations
    test_locations = [
        {'country': 'US', 'region': 'NY', 'city': 'New York'},
        {'country': 'US', 'region': 'CA', 'city': 'Los Angeles'},
        {'country': 'US', 'region': 'TX', 'city': 'Houston'},
        {'country': 'US', 'region': 'FL', 'city': 'Miami'},
        {'country': 'US', 'region': 'IL', 'city': 'Chicago'},
        {'country': 'US', 'region': 'WA', 'city': 'Seattle'},
        {'country': 'US', 'region': 'GA', 'city': 'Atlanta'},
        {'country': 'US', 'region': 'NC', 'city': 'Charlotte'},
        {'country': 'US', 'region': 'PA', 'city': 'Philadelphia'},
        {'country': 'US', 'region': 'AZ', 'city': 'Phoenix'},
        {'country': 'US', 'region': 'LA', 'city': 'New Orleans'},  # French influence
        {'country': 'US', 'region': 'DE', 'city': 'Wilmington'},   # Delaware itself
    ]
    
    print(f"Testing {len(test_locations)} US locations...")
    print()
    
    for i, location in enumerate(test_locations, 1):
        print(f"📍 Test {i}: {location['city']}, {location['region']}")
        print("-" * 40)
        
        # Create session with this location
        session = create_advanced_session(use_proxy=False, location=location)
        
        # Get geographic headers
        geo_headers = get_geographic_headers(location)
        
        print(f"  User-Agent: {session.headers.get('User-Agent', 'N/A')[:50]}...")
        print(f"  Accept-Language: {geo_headers.get('Accept-Language', 'N/A')}")
        print(f"  X-Forwarded-For: {geo_headers.get('X-Forwarded-For', 'N/A')}")
        print(f"  X-Real-IP: {geo_headers.get('X-Real-IP', 'N/A')}")
        
        # Check for regional language variations
        lang = geo_headers.get('Accept-Language', '')
        if ',es;q=0.8' in lang:
            print(f"  🌮 Spanish language detected (Hispanic-heavy region)")
        elif ',fr;q=0.8' in lang:
            print(f"  🥖 French language detected (Louisiana)")
        elif any(x in lang for x in [',zh;q=0.8', ',ko;q=0.8', ',vi;q=0.8', ',ar;q=0.8', ',hi;q=0.8']):
            print(f"  🌏 Additional language detected (diverse major city)")
        else:
            print(f"  🇺🇸 Standard English (US)")
        
        print()
    
    # Test random location selection
    print("🎲 Testing Random US Location Selection")
    print("=" * 50)
    
    for i in range(5):
        random_location = random.choice(GEO_LOCATIONS)
        print(f"Random Location {i+1}: {random_location['city']}, {random_location['region']} ({random_location['timezone']})")
    
    print()
    print("✅ US Geographic Rotation Test Complete!")
    print()
    print("Key Features:")
    print("• 50+ US states and territories")
    print("• Regional language preferences (Spanish, French, etc.)")
    print("• Realistic US IP address simulation")
    print("• Timezone-aware location data")
    print("• Major city focus for diverse populations")

def test_delaware_specific_location():
    """Test with Delaware-specific location"""
    
    print("\n🏛️ Testing Delaware-Specific Location")
    print("=" * 50)
    
    # Delaware location
    delaware_location = {
        'country': 'US',
        'region': 'DE',
        'city': 'Wilmington',
        'timezone': 'America/New_York'
    }
    
    print(f"Location: {delaware_location['city']}, {delaware_location['region']}")
    
    # Create session
    session = create_advanced_session(use_proxy=False, location=delaware_location)
    geo_headers = get_geographic_headers(delaware_location)
    
    print(f"User-Agent: {session.headers.get('User-Agent', 'N/A')[:60]}...")
    print(f"Accept-Language: {geo_headers.get('Accept-Language', 'N/A')}")
    print(f"X-Forwarded-For: {geo_headers.get('X-Forwarded-For', 'N/A')}")
    print(f"X-Real-IP: {geo_headers.get('X-Real-IP', 'N/A')}")
    
    print("\n✅ Delaware location simulation ready!")

if __name__ == "__main__":
    test_us_geographic_rotation()
    test_delaware_specific_location()
