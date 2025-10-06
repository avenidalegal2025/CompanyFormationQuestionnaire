#!/usr/bin/env python3
"""
Check Actual Response
This script checks what the actual response says when we search for Google LLC.
"""

import requests
from bs4 import BeautifulSoup

def check_actual_response():
    """Check what the actual response says"""
    
    # ScrapeOps configuration
    SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
    SCRAPEOPS_PROXY = f"http://scrapeops.headless_browser_mode=false.country=us:{SCRAPEOPS_API_KEY}@proxy.scrapeops.io:5353"
    
    session = requests.Session()
    session.proxies = {
        'http': SCRAPEOPS_PROXY,
        'https': SCRAPEOPS_PROXY,
        'no_proxy': 'localhost:127.0.0.1'
    }
    
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    })
    
    session.verify = False
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    try:
        # Get Delaware page
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        print("📄 Getting Delaware search page...")
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        # Parse the form
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        if not form:
            print("❌ Form not found!")
            return
        
        print("✅ Form found")
        
        # Prepare search for Google
        form_data = {}
        for hidden_input in form.find_all('input', type='hidden'):
            name = hidden_input.get('name')
            value = hidden_input.get('value', '')
            if name:
                form_data[name] = value
        
        form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = 'Google'
        form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
        
        print("🔍 Searching for Google...")
        
        # Submit search
        search_response = session.post(search_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        
        print("✅ Search submitted")
        
        # Parse results
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Look for error messages
        print("\n🚨 Checking for error messages...")
        error_span = results_soup.find('span', {'id': 'ctl00_ContentPlaceHolder1_lblErrorMessage'})
        if error_span:
            error_text = error_span.get_text(strip=True)
            print(f"   Error message: '{error_text}'")
        else:
            print("   No explicit error message found")
        
        # Check for blocked status
        if 'blocked' in search_response.text.lower():
            print("   ⚠️  Blocked status detected in response")
        
        # Check for service unavailable
        if 'service not available' in search_response.text.lower():
            print("   ⚠️  Service not available message found")
        
        # Check for maintenance
        if 'maintenance' in search_response.text.lower():
            print("   ⚠️  Maintenance message found")
        
        # Check for CAPTCHA
        if 'captcha' in search_response.text.lower():
            print("   🧩 CAPTCHA detected")
        
        # Look for any visible text in the results area
        print("\n📊 Checking results area...")
        results_div = results_soup.find('div', {'id': 'ctl00_ContentPlaceHolder1_pnlResults'})
        if results_div:
            results_text = results_div.get_text(strip=True)
            print(f"   Results div text: '{results_text[:200]}...'")
        else:
            print("   No results div found")
        
        # Check the results table
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if results_table:
            rows = results_table.find_all('tr')
            print(f"   Results table found with {len(rows)} rows")
            
            if len(rows) == 1:
                print("   ⚠️  Table has only header row - this usually means blocked/banned")
                # Check what's in the header
                header_cells = rows[0].find_all(['th', 'td'])
                if header_cells:
                    header_text = [cell.get_text(strip=True) for cell in header_cells]
                    print(f"   Header: {header_text}")
        else:
            print("   No results table found")
        
        # Look for any text that might indicate blocking
        print("\n🔍 Looking for blocking indicators...")
        blocking_indicators = [
            'service not available',
            'temporarily unavailable',
            'access denied',
            'blocked',
            'banned',
            'maintenance',
            'error occurred',
            'invalid request'
        ]
        
        found_indicators = []
        for indicator in blocking_indicators:
            if indicator in search_response.text.lower():
                found_indicators.append(indicator)
        
        if found_indicators:
            print("   ❌ BLOCKING INDICATORS FOUND:")
            for indicator in found_indicators:
                print(f"     - {indicator}")
        else:
            print("   ✅ No obvious blocking indicators found")
        
        # Save the response for inspection
        with open('delaware_search_response.html', 'w', encoding='utf-8') as f:
            f.write(search_response.text)
        print(f"\n💾 Full response saved to delaware_search_response.html")
        
        # Show a snippet of the page content
        print(f"\n📄 Page content snippet (first 500 characters):")
        print("-" * 50)
        print(search_response.text[:500])
        print("-" * 50)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_actual_response()
