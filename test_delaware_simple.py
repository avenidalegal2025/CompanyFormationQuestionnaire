#!/usr/bin/env python3
"""
Simple Delaware Test with Bright Data Proxy
This script tests the Delaware search with a simpler approach.
"""

import requests
import json
import time
from delaware_proxy_config import PROXY_SERVICES, build_proxy_url, get_random_proxy

def test_proxy_connection():
    """Test basic proxy connection"""
    
    print("🔑 Testing Bright Data Proxy Connection")
    print("=" * 50)
    
    # Get proxy configuration
    proxy_config = get_random_proxy()
    if not proxy_config:
        print("❌ No proxy configuration available")
        return False
    
    proxy_url = build_proxy_url(proxy_config)
    if not proxy_url:
        print("❌ Failed to build proxy URL")
        return False
    
    print(f"🌐 Proxy URL: {proxy_url}")
    
    # Create session
    session = requests.Session()
    session.proxies = {
        'http': proxy_url,
        'https': proxy_url
    }
    
    # Disable SSL verification
    session.verify = False
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    # Test with a simple site
    try:
        print("🧪 Testing with httpbin.org/ip...")
        response = session.get('http://httpbin.org/ip', timeout=30)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ Success! Your IP: {result.get('origin', 'Unknown')}")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_delaware_access():
    """Test access to Delaware website"""
    
    print("\n🏛️ Testing Delaware Website Access")
    print("=" * 50)
    
    # Get proxy configuration
    proxy_config = get_random_proxy()
    if not proxy_config:
        print("❌ No proxy configuration available")
        return False
    
    proxy_url = build_proxy_url(proxy_config)
    if not proxy_url:
        print("❌ Failed to build proxy URL")
        return False
    
    print(f"🌐 Using proxy: {proxy_url}")
    
    # Create session
    session = requests.Session()
    session.proxies = {
        'http': proxy_url,
        'https': proxy_url
    }
    
    # Disable SSL verification
    session.verify = False
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    # Set realistic headers
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    })
    
    try:
        # Test with a simple HTTP version first
        print("🧪 Testing with HTTP version...")
        delaware_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        response = session.get(delaware_url, timeout=30)
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Length: {len(response.text)} characters")
        
        if response.status_code == 200:
            print("✅ Successfully accessed Delaware website via HTTP")
            return True
        else:
            print("⚠️  HTTP access failed, trying HTTPS...")
            
            # Try HTTPS version
            delaware_url_https = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
            response = session.get(delaware_url_https, timeout=30)
            print(f"   Status Code: {response.status_code}")
            print(f"   Response Length: {len(response.text)} characters")
            
            if response.status_code == 200:
                print("✅ Successfully accessed Delaware website via HTTPS")
                return True
            else:
                print(f"❌ Both HTTP and HTTPS failed")
                return False
                
    except Exception as e:
        print(f"❌ Error accessing Delaware website: {e}")
        return False

def test_alternative_approach():
    """Test alternative approach using different headers"""
    
    print("\n🔄 Testing Alternative Approach")
    print("=" * 50)
    
    # Get proxy configuration
    proxy_config = get_random_proxy()
    if not proxy_config:
        print("❌ No proxy configuration available")
        return False
    
    proxy_url = build_proxy_url(proxy_config)
    if not proxy_url:
        print("❌ Failed to build proxy URL")
        return False
    
    # Create session with different approach
    session = requests.Session()
    session.proxies = {
        'http': proxy_url,
        'https': proxy_url
    }
    
    # Disable SSL verification
    session.verify = False
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    # Try different user agents
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ]
    
    for i, user_agent in enumerate(user_agents, 1):
        print(f"🧪 Testing User Agent {i}: {user_agent[:50]}...")
        
        session.headers.update({
            'User-Agent': user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        try:
            # Test with a simple site first
            response = session.get('http://httpbin.org/ip', timeout=10)
            if response.status_code == 200:
                print(f"   ✅ User Agent {i} works with proxy")
                
                # Now test Delaware
                delaware_url = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
                response = session.get(delaware_url, timeout=30)
                print(f"   Delaware Status: {response.status_code}")
                
                if response.status_code == 200:
                    print(f"   ✅ User Agent {i} works with Delaware!")
                    return True
                else:
                    print(f"   ❌ User Agent {i} failed with Delaware")
            else:
                print(f"   ❌ User Agent {i} failed with proxy")
                
        except Exception as e:
            print(f"   ❌ User Agent {i} error: {e}")
        
        # Add delay between tests
        time.sleep(2)
    
    print("❌ All user agents failed")
    return False

def main():
    """Main test function"""
    
    print("🚀 Delaware Search Test with Bright Data Proxy")
    print("=" * 60)
    
    # Test 1: Basic proxy connection
    if test_proxy_connection():
        print("\n🎉 Proxy connection is working!")
        
        # Test 2: Delaware access
        if test_delaware_access():
            print("\n🎉 Delaware website access is working!")
        else:
            print("\n⚠️  Delaware website access failed, trying alternative approach...")
            
            # Test 3: Alternative approach
            if test_alternative_approach():
                print("\n🎉 Alternative approach works!")
            else:
                print("\n❌ All approaches failed")
    else:
        print("\n❌ Proxy connection failed")

if __name__ == "__main__":
    main()
