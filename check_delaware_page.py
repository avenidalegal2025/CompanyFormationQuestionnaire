#!/usr/bin/env python3
"""
Check Delaware Page
This script checks what's actually on the Delaware search page to see the real messages.
"""

import requests
from bs4 import BeautifulSoup

def check_delaware_page():
    """Check what's actually on the Delaware search page"""
    
    # ScrapeOps configuration
    SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
    SCRAPEOPS_PROXY = f"http://scrapeops.headless_browser_mode=true:{SCRAPEOPS_API_KEY}@proxy.scrapeops.io:5353"
    
    print("🔍 Checking Delaware Search Page")
    print("=" * 50)
    
    try:
        # Create session with ScrapeOps proxy
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
        
        # Get the search page
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        response = session.get(search_url, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Length: {len(response.text)} characters")
        print()
        
        # Parse the response
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Check for error messages
        print("🚨 Checking for error messages...")
        error_indicators = [
            'error occurred while processing',
            'auth failed',
            'ip_forbidden',
            'access denied',
            'blocked',
            'banned',
            'invalid request'
        ]
        
        found_errors = []
        for indicator in error_indicators:
            if indicator in response.text.lower():
                found_errors.append(indicator)
        
        if found_errors:
            print("   ❌ ERROR MESSAGES FOUND:")
            for error in found_errors:
                print(f"     - {error}")
        else:
            print("   ✅ No error messages found")
        
        print()
        
        # Look for the search form
        print("📝 Checking search form...")
        form = soup.find('form')
        if form:
            print("   ✅ Search form found")
            
            # Look for the search input
            search_input = form.find('input', {'name': 'ctl00$ContentPlaceHolder1$frmEntityName'})
            if search_input:
                print("   ✅ Search input field found")
            else:
                print("   ❌ Search input field not found")
                
            # Look for submit button
            submit_button = form.find('input', {'name': 'ctl00$ContentPlaceHolder1$btnSubmit'})
            if submit_button:
                print("   ✅ Submit button found")
            else:
                print("   ❌ Submit button not found")
        else:
            print("   ❌ No search form found")
        
        print()
        
        # Look for any tables
        print("📊 Checking for tables...")
        tables = soup.find_all('table')
        print(f"   Found {len(tables)} tables on the page")
        
        for i, table in enumerate(tables):
            table_id = table.get('id', 'no-id')
            rows = table.find_all('tr')
            print(f"   Table {i+1}: id=\"{table_id}\", rows={len(rows)}")
            
            if table_id == 'tblResults':
                print("     ✅ This is the results table!")
                if len(rows) > 1:
                    print(f"     📋 Found {len(rows)-1} result rows")
                    for j, row in enumerate(rows[1:3], 1):  # Show first 2 results
                        cells = row.find_all('td')
                        if cells:
                            file_number = cells[0].get_text(strip=True)
                            entity_name = cells[1].get_text(strip=True)
                            print(f"       Row {j}: {file_number} - {entity_name}")
                else:
                    print("     ❌ Results table is empty (only header)")
        
        print()
        
        # Look for specific messages
        print("💬 Checking for specific messages...")
        page_text = response.text.lower()
        
        messages_to_check = [
            'no records found',
            'no results found',
            'no entities found',
            'search returned no results',
            'please enter a search term',
            'invalid search',
            'session expired',
            'captcha',
            'verification required'
        ]
        
        found_messages = []
        for message in messages_to_check:
            if message in page_text:
                found_messages.append(message)
        
        if found_messages:
            print("   📝 MESSAGES FOUND:")
            for message in found_messages:
                print(f"     - {message}")
        else:
            print("   ✅ No specific messages found")
        
        # Save the response for inspection
        with open('delaware_page_response.html', 'w', encoding='utf-8') as f:
            f.write(response.text)
        print(f"\n💾 Full response saved to delaware_page_response.html")
        
        # Show a snippet of the page content
        print(f"\n📄 Page content snippet (first 500 characters):")
        print("-" * 50)
        print(response.text[:500])
        print("-" * 50)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_delaware_page()
