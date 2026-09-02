import os
#!/usr/bin/env python3
"""
Test Residential Proxy and 2captcha Integration
This script tests the ScrapeOps residential proxy and 2captcha integration.
"""

import requests
import time
import random
import base64
from bs4 import BeautifulSoup

# ScrapeOps Residential Proxy configuration
SCRAPEOPS_API_KEY = os.environ["SCRAPEOPS_API_KEY"]
SCRAPEOPS_RESIDENTIAL_PROXY = f"http://scrapeops:{SCRAPEOPS_API_KEY}@residential-proxy.scrapeops.io:8181"

# 2captcha configuration
CAPTCHA_API_KEY = os.environ["CAPTCHA_API_KEY"]
CAPTCHA_SOLVE_URL = "http://2captcha.com/in.php"
CAPTCHA_RESULT_URL = "http://2captcha.com/res.php"

def test_residential_proxy():
    """Test ScrapeOps residential proxy connection"""
    
    print("🏠 Testing ScrapeOps Residential Proxy")
    print("=" * 50)
    
    try:
        session = requests.Session()
        session.proxies = {
            'http': SCRAPEOPS_RESIDENTIAL_PROXY,
            'https': SCRAPEOPS_RESIDENTIAL_PROXY,
            'no_proxy': 'localhost:127.0.0.1'
        }
        
        # Disable SSL verification as required by ScrapeOps
        session.verify = False
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        # Test IP
        print("🌐 Testing IP address...")
        response = session.get('http://httpbin.org/ip', timeout=30)
        response.raise_for_status()
        
        ip_data = response.json()
        print(f"   ✅ Current IP: {ip_data.get('origin', 'Unknown')}")
        
        # Test headers
        print("\n🎭 Testing headers...")
        headers_response = session.get('http://httpbin.org/headers', timeout=30)
        headers_response.raise_for_status()
        
        headers_data = headers_response.json()
        user_agent = headers_data.get('headers', {}).get('User-Agent', 'Unknown')
        print(f"   ✅ User-Agent: {user_agent[:50]}...")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_fake_browser_headers():
    """Test ScrapeOps fake browser headers API"""
    
    print("\n🎭 Testing ScrapeOps Fake Browser Headers")
    print("=" * 50)
    
    try:
        headers_url = f"http://headers.scrapeops.io/v1/browser-headers?api_key={SCRAPEOPS_API_KEY}"
        response = requests.get(headers_url, timeout=30)
        response.raise_for_status()
        
        header_list = response.json().get('result', [])
        if header_list:
            print(f"   ✅ Retrieved {len(header_list)} fake browser headers")
            
            # Test a random header
            random_header = random.choice(header_list)
            print(f"   📋 Sample header:")
            for key, value in random_header.items():
                print(f"     {key}: {value[:50]}...")
            
            return True
        else:
            print("   ❌ No headers returned")
            return False
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_2captcha_balance():
    """Test 2captcha account balance"""
    
    print("\n💰 Testing 2captcha Account Balance")
    print("=" * 50)
    
    try:
        balance_data = {
            'key': CAPTCHA_API_KEY,
            'action': 'getbalance'
        }
        
        response = requests.get(CAPTCHA_RESULT_URL, params=balance_data, timeout=30)
        response.raise_for_status()
        
        if response.text.startswith('ERROR'):
            print(f"   ❌ Error: {response.text}")
            return False
        else:
            balance = float(response.text)
            print(f"   ✅ Account balance: ${balance:.2f}")
            return balance > 0
        
    except Exception as e:
        print(f"   ❌ Error checking balance: {e}")
        return False

def test_delaware_access():
    """Test access to Delaware website through residential proxy"""
    
    print("\n🏛️ Testing Delaware Website Access")
    print("=" * 50)
    
    try:
        session = requests.Session()
        session.proxies = {
            'http': SCRAPEOPS_RESIDENTIAL_PROXY,
            'https': SCRAPEOPS_RESIDENTIAL_PROXY,
            'no_proxy': 'localhost:127.0.0.1'
        }
        
        # Get fake browser headers
        headers_url = f"http://headers.scrapeops.io/v1/browser-headers?api_key={SCRAPEOPS_API_KEY}"
        headers_response = requests.get(headers_url, timeout=30)
        if headers_response.status_code == 200:
            header_list = headers_response.json().get('result', [])
            if header_list:
                session.headers.update(random.choice(header_list))
        
        session.verify = False
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        # Test Delaware access
        delaware_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        print(f"🔍 Testing access to: {delaware_url}")
        
        response = session.get(delaware_url, timeout=30)
        response.raise_for_status()
        
        print(f"   ✅ Status: {response.status_code}")
        print(f"   📄 Response length: {len(response.text)} characters")
        
        # Parse for CAPTCHA
        soup = BeautifulSoup(response.text, 'html.parser')
        captcha_div = soup.find('div', {'id': 'ctl00_ContentPlaceHolder1_captchaDiv'})
        captcha_img = soup.find('img', {'id': 'ctl00_ContentPlaceHolder1_imgCaptcha'})
        
        if captcha_div:
            print("   🧩 CAPTCHA div found")
        else:
            print("   ✅ No CAPTCHA div found")
        
        if captcha_img:
            print("   🧩 CAPTCHA image found")
        else:
            print("   ✅ No CAPTCHA image found")
        
        # Check for blocking
        if 'blocked' in response.text.lower():
            print("   ⚠️  Blocked status detected")
        else:
            print("   ✅ No blocking detected")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def main():
    """Main test function"""
    
    print("🚀 Residential Proxy and 2captcha Integration Test")
    print("=" * 60)
    
    # Test 1: Residential proxy
    if not test_residential_proxy():
        print("\n❌ Residential proxy test failed")
        return
    
    # Test 2: Fake browser headers
    if not test_fake_browser_headers():
        print("\n❌ Fake browser headers test failed")
        return
    
    # Test 3: 2captcha balance
    if not test_2captcha_balance():
        print("\n❌ 2captcha balance check failed")
        return
    
    # Test 4: Delaware access
    if not test_delaware_access():
        print("\n❌ Delaware access test failed")
        return
    
    print("\n✅ All tests passed!")
    print("\n🎉 Residential proxy and 2captcha integration is ready!")
    print("\n📋 Next steps:")
    print("   1. Deploy the enhanced Lambda function")
    print("   2. Test with real company name searches")
    print("   3. Monitor performance and adjust as needed")

if __name__ == "__main__":
    main()
