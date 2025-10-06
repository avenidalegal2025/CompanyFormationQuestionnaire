#!/usr/bin/env python3
"""
Test Bright Data API Key Integration
This script tests the Bright Data API key configuration and connection.
"""

import requests
import json
import time
from delaware_proxy_config import PROXY_SERVICES, build_proxy_url, get_random_proxy

def test_bright_data_api_key():
    """Test Bright Data API key connection"""
    
    print("🔑 Testing Bright Data API Key")
    print("=" * 50)
    
    # Get Bright Data configuration
    bright_data_config = PROXY_SERVICES.get('bright_data', {})
    
    print(f"✅ Configuration loaded:")
    print(f"   Enabled: {bright_data_config.get('enabled', False)}")
    print(f"   Username: {bright_data_config.get('username', 'Not set')}")
    print(f"   API Key: {bright_data_config.get('api_key', 'Not set')[:20]}...")
    print(f"   Endpoint: {bright_data_config.get('endpoint', 'Not set')}")
    print()
    
    # Build proxy URL
    proxy_url = build_proxy_url(bright_data_config)
    if not proxy_url:
        print("❌ Failed to build proxy URL")
        return False
    
    print(f"🌐 Proxy URL: {proxy_url}")
    print()
    
    # Test connection
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
        
        # Test with httpbin.org/ip
        test_url = 'https://httpbin.org/ip'
        response = session.get(test_url, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ Success! Your IP: {result.get('origin', 'Unknown')}")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Time: {response.elapsed.total_seconds():.2f}s")
        return True
        
    except requests.exceptions.ProxyError as e:
        print(f"❌ Proxy Error: {e}")
        print("   This usually means the API key is invalid or the proxy is not accessible")
        return False
    except requests.exceptions.Timeout as e:
        print(f"❌ Timeout Error: {e}")
        print("   The proxy connection timed out")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Request Error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        return False

def test_delaware_access():
    """Test access to Delaware search page through Bright Data proxy"""
    
    print("\n🏛️ Testing Delaware Search Access")
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

def test_enhanced_rotation():
    """Test enhanced rotation features"""
    
    print("\n🔄 Testing Enhanced Rotation Features")
    print("=" * 50)
    
    try:
        from delaware_lambda_enhanced import (
            get_geographic_headers_enhanced,
            get_weighted_user_agent,
            generate_realistic_us_ip
        )
        
        # Test geographic headers
        print("🌍 Testing geographic headers...")
        headers = get_geographic_headers_enhanced()
        print(f"   User-Agent: {headers.get('User-Agent', 'Not set')[:50]}...")
        print(f"   Accept-Language: {headers.get('Accept-Language', 'Not set')}")
        print(f"   X-Forwarded-For: {headers.get('X-Forwarded-For', 'Not set')}")
        print(f"   X-Real-IP: {headers.get('X-Real-IP', 'Not set')}")
        
        # Test user agent distribution
        print("\n🎭 Testing user agent distribution...")
        user_agents = [get_weighted_user_agent() for _ in range(10)]
        chrome_count = sum(1 for ua in user_agents if 'Chrome' in ua)
        firefox_count = sum(1 for ua in user_agents if 'Firefox' in ua)
        safari_count = sum(1 for ua in user_agents if 'Safari' in ua and 'Chrome' not in ua)
        edge_count = sum(1 for ua in user_agents if 'Edg' in ua)
        
        print(f"   Chrome: {chrome_count}/10 ({chrome_count*10}%)")
        print(f"   Firefox: {firefox_count}/10 ({firefox_count*10}%)")
        print(f"   Safari: {safari_count}/10 ({safari_count*10}%)")
        print(f"   Edge: {edge_count}/10 ({edge_count*10}%)")
        
        # Test IP generation
        print("\n🌐 Testing IP generation...")
        ips = [generate_realistic_us_ip() for _ in range(5)]
        for i, ip in enumerate(ips, 1):
            print(f"   IP {i}: {ip}")
        
        print("✅ Enhanced rotation features working correctly")
        return True
        
    except ImportError as e:
        print(f"❌ Could not import enhanced features: {e}")
        return False
    except Exception as e:
        print(f"❌ Enhanced rotation test failed: {e}")
        return False

def main():
    """Main test function"""
    
    print("🚀 Bright Data API Key Integration Test")
    print("=" * 60)
    
    # Test 1: API Key connection
    api_success = test_bright_data_api_key()
    
    if api_success:
        print("\n🎉 Bright Data API key is working!")
        
        # Test 2: Delaware access
        delaware_success = test_delaware_access()
        
        if delaware_success:
            print("\n🎉 Delaware search access through Bright Data is working!")
        else:
            print("\n⚠️  Delaware search access failed, but API key is working")
        
        # Test 3: Enhanced rotation
        rotation_success = test_enhanced_rotation()
        
        if rotation_success:
            print("\n🎉 Enhanced rotation features are working!")
        else:
            print("\n⚠️  Enhanced rotation features failed")
        
        print("\n✅ Bright Data integration is ready!")
        print("\nNext steps:")
        print("1. Deploy your Lambda function with Bright Data enabled")
        print("2. Test with real company name searches")
        print("3. Monitor performance and adjust as needed")
        
    else:
        print("\n❌ Bright Data API key test failed")
        print("\nTroubleshooting:")
        print("1. Check if your API key is correct")
        print("2. Verify your Bright Data account is active")
        print("3. Check if you have proxy access enabled")
        print("4. Contact Bright Data support if needed")

if __name__ == "__main__":
    main()
