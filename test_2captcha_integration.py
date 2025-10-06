#!/usr/bin/env python3
"""
Test 2captcha Integration
This script tests the 2captcha service integration for Delaware CAPTCHA solving.
"""

import requests
import time
import base64
from bs4 import BeautifulSoup

# 2captcha configuration
CAPTCHA_API_KEY = "f70e8ca44204cc56c23f32925064ee93"
CAPTCHA_SOLVE_URL = "http://2captcha.com/in.php"
CAPTCHA_RESULT_URL = "http://2captcha.com/res.php"

def test_2captcha_balance():
    """Test 2captcha account balance"""
    
    print("💰 Testing 2captcha account balance...")
    
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

def test_2captcha_with_sample_image():
    """Test 2captcha with a sample CAPTCHA image"""
    
    print("\n🧩 Testing 2captcha with sample image...")
    
    try:
        # Create a simple test image (1x1 pixel)
        from PIL import Image, ImageDraw, ImageFont
        import io
        
        # Create a simple test image with text
        img = Image.new('RGB', (200, 50), color='white')
        draw = ImageDraw.Draw(img)
        
        # Try to use a default font, fallback to basic if not available
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 20)
        except:
            font = ImageFont.load_default()
        
        draw.text((10, 15), "TEST123", fill='black', font=font)
        
        # Convert to base64
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        print("   📤 Submitting test CAPTCHA...")
        
        # Submit to 2captcha
        solve_data = {
            'key': CAPTCHA_API_KEY,
            'method': 'base64',
            'body': img_base64
        }
        
        solve_response = requests.post(CAPTCHA_SOLVE_URL, data=solve_data, timeout=30)
        solve_response.raise_for_status()
        
        if solve_response.text.startswith('OK|'):
            captcha_id = solve_response.text.split('|')[1]
            print(f"   ✅ CAPTCHA submitted, ID: {captcha_id}")
            
            # Wait for solution
            print("   ⏳ Waiting for solution...")
            for attempt in range(10):  # Wait up to 2 minutes
                time.sleep(12)
                
                result_data = {
                    'key': CAPTCHA_API_KEY,
                    'action': 'get',
                    'id': captcha_id
                }
                
                result_response = requests.get(CAPTCHA_RESULT_URL, params=result_data, timeout=30)
                result_response.raise_for_status()
                
                if result_response.text == 'CAPCHA_NOT_READY':
                    print(f"   ⏳ Still processing... (attempt {attempt + 1}/10)")
                    continue
                elif result_response.text.startswith('OK|'):
                    captcha_solution = result_response.text.split('|')[1]
                    print(f"   ✅ CAPTCHA solved: {captcha_solution}")
                    return True
                else:
                    print(f"   ❌ CAPTCHA solving failed: {result_response.text}")
                    return False
            
            print("   ❌ CAPTCHA solving timeout")
            return False
        else:
            print(f"   ❌ CAPTCHA submission failed: {solve_response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ Error testing 2captcha: {e}")
        return False

def test_delaware_captcha_detection():
    """Test if we can detect CAPTCHA on Delaware's website"""
    
    print("\n🔍 Testing Delaware CAPTCHA detection...")
    
    try:
        # ScrapeOps configuration
        SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
        SCRAPEOPS_PROXY = f"http://scrapeops.headless_browser_mode=true:{SCRAPEOPS_API_KEY}@proxy.scrapeops.io:5353"
        
        session = requests.Session()
        session.proxies = {
            'http': SCRAPEOPS_PROXY,
            'https': SCRAPEOPS_PROXY,
            'no_proxy': 'localhost:127.0.0.1'
        }
        
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        session.verify = False
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        # Get Delaware page
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        # Parse for CAPTCHA
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Check for CAPTCHA elements
        captcha_div = soup.find('div', {'id': 'ctl00_ContentPlaceHolder1_captchaDiv'})
        captcha_img = soup.find('img', {'id': 'ctl00_ContentPlaceHolder1_imgCaptcha'})
        
        if captcha_div:
            print("   ✅ CAPTCHA div found")
        else:
            print("   ❌ CAPTCHA div not found")
        
        if captcha_img:
            print("   ✅ CAPTCHA image found")
            captcha_src = captcha_img.get('src')
            print(f"   📷 CAPTCHA image src: {captcha_src}")
        else:
            print("   ❌ CAPTCHA image not found")
        
        # Check for blocked status
        if 'blocked' in response.text.lower():
            print("   ⚠️  Page shows 'blocked' status")
        
        if 'captcha' in response.text.lower():
            print("   ⚠️  Page contains 'captcha' text")
        
        return captcha_div is not None and captcha_img is not None
        
    except Exception as e:
        print(f"   ❌ Error testing Delaware: {e}")
        return False

def main():
    """Main test function"""
    
    print("🚀 2captcha Integration Test")
    print("=" * 50)
    
    # Test 1: Check account balance
    if not test_2captcha_balance():
        print("\n❌ 2captcha account balance check failed")
        return
    
    # Test 2: Test with sample image
    if not test_2captcha_with_sample_image():
        print("\n❌ 2captcha sample test failed")
        return
    
    # Test 3: Test Delaware CAPTCHA detection
    if not test_delaware_captcha_detection():
        print("\n❌ Delaware CAPTCHA detection failed")
        return
    
    print("\n✅ All 2captcha tests passed!")
    print("\n🎉 2captcha integration is ready for Delaware search!")

if __name__ == "__main__":
    main()
