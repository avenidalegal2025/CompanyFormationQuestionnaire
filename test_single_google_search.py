#!/usr/bin/env python3
"""
Single Test for Google LLC (Mobile Proxy)
This script tests Delaware search for Google LLC using ScrapeOps Residential & Mobile Proxy Aggregator with a mobile User-Agent. One-off run.
"""

import requests
import time
import random
from bs4 import BeautifulSoup

# ScrapeOps Residential & Mobile Proxy Aggregator (docs: https://scrapeops.io/docs/residential-mobile-proxy-aggregator/overview/)
# Proxy format: http://scrapeops:YOUR_API_KEY@residential-proxy.scrapeops.io:8181
SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
SCRAPEOPS_PROXY = f"http://scrapeops:{SCRAPEOPS_API_KEY}@residential-proxy.scrapeops.io:8181"

# Realistic mobile user agents
MOBILE_UAS = [
    # iPhone Safari iOS 17
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    # Android Chrome 131 on Pixel
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    # Samsung Internet (Android)
    "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/131.0.0.0 Mobile Safari/537.36",
]


def test_google_llc_search():
    """Test Delaware search for Google LLC with mobile proxy once"""
    
    print("🔍 Mobile Proxy Test: Delaware Search for Google LLC (one-off)")
    print("=" * 68)
    print("⚠️  Using ScrapeOps Residential & Mobile Aggregator with mobile UA")
    print()
    
    try:
        # Create session with mobile proxy settings
        session = requests.Session()
        session.proxies = {
            'http': SCRAPEOPS_PROXY,
            'https': SCRAPEOPS_PROXY,
            'no_proxy': 'localhost:127.0.0.1'
        }
        
        # Mobile headers
        session.headers.update({
            'User-Agent': random.choice(MOBILE_UAS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        })
        
        # ScrapeOps proxy port requires verify=False per docs
        session.verify = False
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        # Test IP first
        print("🌐 Testing IP address via proxy...")
        ip_test = session.get('http://httpbin.org/ip', timeout=30)
        if ip_test.status_code == 200:
            ip_data = ip_test.json()
            print(f"   ✅ Current IP: {ip_data.get('origin', 'Unknown')}")
        else:
            print("   ⚠️  Could not determine IP")
        
        print()
        
        # Longer delay to be respectful
        delay = random.uniform(12, 18)
        print(f"⏱️  Waiting {delay:.1f} seconds before accessing Delaware...")
        time.sleep(delay)
        
        # Get Delaware search page
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        print("📄 Getting Delaware search page (mobile UA)...")
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        print(f"   Status: {response.status_code}")
        print(f"   Length: {len(response.text)} characters")
        
        # Parse the form
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        if not form:
            print("   ❌ Form not found!")
            return {'success': False, 'available': False, 'message': 'Form not found', 'method': 'delaware_mobile_once'}
        print("   ✅ Form found")
        
        # Check for CAPTCHA or blocking
        lower_html = response.text.lower()
        if 'captcha' in lower_html:
            print("   🧩 CAPTCHA detected")
        if 'blocked' in lower_html:
            print("   🚫 Blocked status detected")
        if 'service not available' in lower_html or 'unavailable' in lower_html:
            print("   🚧 Service unavailable message detected")
        
        # Prepare search for Google LLC
        search_term = "Google"  # Base name without LLC
        print(f"🔍 Searching for: {search_term}")
        
        # Extract form data
        form_data = {}
        for hidden_input in form.find_all('input', type='hidden'):
            name = hidden_input.get('name')
            value = hidden_input.get('value', '')
            if name:
                form_data[name] = value
        
        # Add search data
        form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = search_term
        form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
        
        print(f"📝 Found {len(form_data)} form fields")
        
        # Delay before submission
        delay = random.uniform(6, 9)
        print(f"⏱️  Waiting {delay:.1f} seconds before form submission...")
        time.sleep(delay)
        
        # Submit search
        print("📤 Submitting search (mobile UA)...")
        search_response = session.post(search_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        print("✅ Search submitted successfully")
        
        # Parse results
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        page_text = results_soup.get_text().lower()
        
        # Blocked detection first
        if 'blocked' in page_text:
            print("   🚫 Blocked status detected in results")
            return {
                'success': False,
                'available': False,
                'message': 'Access blocked by Delaware website (mobile proxy)',
                'method': 'delaware_mobile_once'
            }
        
        # No results phrases
        if any(phrase in page_text for phrase in [
            'no records found', 'no results found', 'no entities found',
            'no matches found', 'search returned no results'
        ]):
            print("✅ No results found - Google LLC appears to be available")
            return {
                'success': True,
                'available': True,
                'message': 'Google LLC appears to be available in Delaware',
                'method': 'delaware_mobile_once'
            }
        
        # Results table parsing
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if results_table:
            rows = results_table.find_all('tr')
            print(f"📋 Found results table with {len(rows)} rows")
            if len(rows) <= 1:
                print("   ⚠️  Only header row present (could indicate block)")
                return {
                    'success': False,
                    'available': False,
                    'message': 'Blocked or empty results (mobile proxy)',
                    'method': 'delaware_mobile_once'
                }
            else:
                exact_matches = []
                for row in rows[1:]:
                    cells = row.find_all('td')
                    if len(cells) >= 2:
                        entity_name = cells[1].get_text(strip=True)
                        if 'google' in entity_name.lower():
                            exact_matches.append(entity_name)
                if exact_matches:
                    print(f"   ❌ Found {len(exact_matches)} Google-related entities")
                    return {
                        'success': True,
                        'available': False,
                        'message': f'Google LLC is NOT available - found {len(exact_matches)} similar entities',
                        'method': 'delaware_mobile_once',
                        'existing_entities': exact_matches
                    }
                print("   ✅ No Google-related entities found - appears available")
                return {
                    'success': True,
                    'available': True,
                    'message': 'Google LLC appears to be available in Delaware',
                    'method': 'delaware_mobile_once'
                }
        
        # Fallback
        print("⚠️  Could not parse results clearly (mobile proxy)")
        return {
            'success': False,
            'available': False,
            'message': 'Unclear result (mobile proxy)',
            'method': 'delaware_mobile_once'
        }
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return {
            'success': False,
            'available': False,
            'message': f'Error: {str(e)}',
            'method': 'delaware_mobile_once'
        }


if __name__ == "__main__":
    print("🚀 Single Test: Google LLC in Delaware (Mobile Proxy)")
    print("⚠️  One-off test to avoid bans")
    print()
    result = test_google_llc_search()
    print("\n" + "=" * 68)
    print("📊 TEST RESULT:")
    print(f"Success: {result.get('success')}")
    print(f"Available: {result.get('available')}")
    print(f"Message: {result.get('message')}")
    print(f"Method: {result.get('method')}")
    if 'existing_entities' in result:
        print(f"Existing Entities: {result['existing_entities']}")
    print("\n✅ Test completed!")
