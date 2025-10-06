#!/usr/bin/env python3
"""
Test Bright Data Proxy with Your Credentials
This script tests the Bright Data proxy using your actual credentials.
"""

import urllib.request
import ssl
import requests
import json
from delaware_proxy_config import PROXY_SERVICES, build_proxy_url

def test_bright_data_proxy_urllib():
    """Test Bright Data proxy using urllib (your method)"""
    
    print("🔑 Testing Bright Data Proxy with urllib")
    print("=" * 50)
    
    proxy = 'http://brd-customer-hl_5dca15c7-zone-residential_proxy1:w434mhlde1m9@brd.superproxy.io:33335'
    url = 'https://geo.brdtest.com/welcome.txt?product=resi&method=native'
    
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({'https': proxy, 'http': proxy}),
        urllib.request.HTTPSHandler(context=ssl._create_unverified_context())
    )
    
    try:
        print("🧪 Testing connection to Bright Data test endpoint...")
        response = opener.open(url)
        result = response.read().decode()
        print(f"✅ Success! Response: {result}")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_bright_data_proxy_requests():
    """Test Bright Data proxy using requests library"""
    
    print("\n🔑 Testing Bright Data Proxy with requests")
    print("=" * 50)
    
    # Get proxy configuration
    bright_data_config = PROXY_SERVICES.get('bright_data', {})
    proxy_url = build_proxy_url(bright_data_config)
    
    if not proxy_url:
        print("❌ Failed to build proxy URL")
        return False
    
    print(f"🌐 Proxy URL: {proxy_url}")
    
    try:
        print("🧪 Testing connection to httpbin.org/ip...")
        
        session = requests.Session()
        session.proxies = {
            'http': proxy_url,
            'https': proxy_url
        }
        
        # Set realistic headers
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        # Test with httpbin.org/ip (using HTTP instead of HTTPS to avoid SSL issues)
        test_url = 'http://httpbin.org/ip'
        response = session.get(test_url, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ Success! Your IP: {result.get('origin', 'Unknown')}")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Time: {response.elapsed.total_seconds():.2f}s")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_delaware_access():
    """Test access to Delaware search page through Bright Data proxy"""
    
    print("\n🏛️ Testing Delaware Search Access")
    print("=" * 50)
    
    # Get proxy configuration
    bright_data_config = PROXY_SERVICES.get('bright_data', {})
    proxy_url = build_proxy_url(bright_data_config)
    
    if not proxy_url:
        print("❌ Failed to build proxy URL")
        return False
    
    print(f"🌐 Using proxy: {proxy_url}")
    
    try:
        # Create session with Bright Data proxy
        session = requests.Session()
        session.proxies = {
            'http': proxy_url,
            'https': proxy_url
        }
        
        # Set realistic headers
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        # Test Delaware search page access
        delaware_url = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        print(f"🔍 Testing access to: {delaware_url}")
        
        response = session.get(delaware_url, timeout=30)
        response.raise_for_status()
        
        print(f"✅ Successfully accessed Delaware search page")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Length: {len(response.text)} characters")
        print(f"   Response Time: {response.elapsed.total_seconds():.2f}s")
        
        # Check if we can find the search form
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        
        if form:
            print("✅ Found search form - ready for searches")
            return True
        else:
            print("⚠️  Search form not found - may need to adjust approach")
            return False
            
    except Exception as e:
        print(f"❌ Delaware access test failed: {e}")
        return False

def test_delaware_search(company_name="Test Company LLC"):
    """Test actual Delaware search through Bright Data proxy"""
    
    print(f"\n🔍 Testing Delaware Search for: {company_name}")
    print("=" * 50)
    
    try:
        from delaware_lambda_enhanced import lambda_handler
        
        # Test with proxy enabled
        event = {
            'companyName': company_name,
            'entityType': 'LLC',
            'useProxy': True
        }
        
        print("🧪 Running Delaware search through Bright Data proxy...")
        result = lambda_handler(event, None)
        
        if result and result.get('statusCode') == 200:
            body = json.loads(result['body'])
            print(f"✅ Search completed successfully!")
            print(f"   Success: {body.get('success')}")
            print(f"   Available: {body.get('available')}")
            print(f"   Message: {body.get('message')}")
            print(f"   Method: {body.get('method')}")
            print(f"   Existing Entities: {len(body.get('existing_entities', []))}")
            return True
        else:
            print(f"❌ Search failed: {result}")
            return False
            
    except Exception as e:
        print(f"❌ Delaware search test failed: {e}")
        return False

def main():
    """Main test function"""
    
    print("🚀 Bright Data Proxy Integration Test")
    print("=" * 60)
    
    # Test 1: urllib method (your original approach)
    urllib_success = test_bright_data_proxy_urllib()
    
    # Test 2: requests method (our integration)
    requests_success = test_bright_data_proxy_requests()
    
    if urllib_success and requests_success:
        print("\n🎉 Bright Data proxy is working with both methods!")
        
        # Test 3: Delaware access
        delaware_access_success = test_delaware_access()
        
        if delaware_access_success:
            print("\n🎉 Delaware search access through Bright Data is working!")
            
            # Test 4: Actual search
            search_success = test_delaware_search("Google LLC")
            
            if search_success:
                print("\n🎉 Delaware search through Bright Data is working!")
            else:
                print("\n⚠️  Delaware search failed, but proxy is working")
        else:
            print("\n⚠️  Delaware access failed, but proxy is working")
        
        print("\n✅ Bright Data integration is ready!")
        print("\nNext steps:")
        print("1. Deploy your Lambda function with Bright Data enabled")
        print("2. Test with real company name searches")
        print("3. Monitor performance and adjust as needed")
        
    else:
        print("\n❌ Bright Data proxy test failed")
        print("\nTroubleshooting:")
        print("1. Check if your proxy credentials are correct")
        print("2. Verify your Bright Data account is active")
        print("3. Check if you have proxy access enabled")
        print("4. Contact Bright Data support if needed")

if __name__ == "__main__":
    main()
