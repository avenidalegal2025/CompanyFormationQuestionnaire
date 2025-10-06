#!/usr/bin/env python3
"""
Debug Delaware Search
This script helps debug what's happening with the Delaware search.
"""

import requests
from bs4 import BeautifulSoup
import time
import random

# ScrapeOps configuration
SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
SCRAPEOPS_PROXY = f"http://scrapeops.headless_browser_mode=true:{SCRAPEOPS_API_KEY}@proxy.scrapeops.io:5353"

def debug_delaware_search(company_name="Apple Inc"):
    """Debug the Delaware search process step by step"""
    
    print(f"🔍 Debugging Delaware search for: {company_name}")
    print("=" * 60)
    
    try:
        # Create session
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
        
        # Step 1: Get the search page
        print("📄 Step 1: Getting Delaware search page...")
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Length: {len(response.text)} characters")
        
        # Step 2: Parse the form
        print("\n📝 Step 2: Parsing search form...")
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        
        if not form:
            print("   ❌ No form found!")
            return
        
        print("   ✅ Form found")
        
        # Step 3: Extract form fields
        print("\n🔍 Step 3: Extracting form fields...")
        form_data = {}
        for input_field in form.find_all('input'):
            name = input_field.get('name')
            value = input_field.get('value', '')
            if name:
                form_data[name] = value
        
        print(f"   Found {len(form_data)} form fields:")
        for key, value in list(form_data.items())[:5]:  # Show first 5
            print(f"     {key}: {value[:50]}...")
        if len(form_data) > 5:
            print(f"     ... and {len(form_data) - 5} more")
        
        # Step 4: Add search term
        search_term = company_name.replace(' Inc', '').replace(' LLC', '').replace(' Corp', '')
        form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = search_term
        form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
        
        print(f"\n🔍 Step 4: Searching for '{search_term}'...")
        print(f"   Form data keys: {list(form_data.keys())}")
        
        # Step 5: Submit search
        print("\n📤 Step 5: Submitting search...")
        search_response = session.post(search_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        
        print(f"   Status Code: {search_response.status_code}")
        print(f"   Response Length: {len(search_response.text)} characters")
        
        # Step 6: Analyze response
        print("\n📊 Step 6: Analyzing response...")
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Check for various indicators
        page_text = results_soup.get_text().lower()
        
        print("   Checking for indicators:")
        print(f"     'no records found': {'no records found' in page_text}")
        print(f"     'no results found': {'no results found' in page_text}")
        print(f"     'no entities found': {'no entities found' in page_text}")
        print(f"     'search returned no results': {'search returned no results' in page_text}")
        
        # Look for results table
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if results_table:
            print("   ✅ Results table found")
            rows = results_table.find_all('tr')
            print(f"     Number of rows: {len(rows)}")
            
            if len(rows) > 1:
                print("     Table contents:")
                for i, row in enumerate(rows[:3]):  # Show first 3 rows
                    cells = row.find_all('td')
                    if cells:
                        cell_texts = [cell.get_text(strip=True) for cell in cells]
                        print(f"       Row {i}: {cell_texts}")
            else:
                print("     Table is empty (only header row)")
        else:
            print("   ❌ No results table found")
            
            # Look for other tables
            all_tables = results_soup.find_all('table')
            print(f"     Found {len(all_tables)} tables total")
            for i, table in enumerate(all_tables):
                table_id = table.get('id', 'no-id')
                rows = table.find_all('tr')
                print(f"       Table {i}: id='{table_id}', rows={len(rows)}")
        
        # Check for error messages
        print("\n🚨 Step 7: Checking for error messages...")
        error_indicators = [
            'error', 'invalid', 'failed', 'denied', 'blocked', 'captcha',
            'session expired', 'timeout', 'unauthorized'
        ]
        
        for indicator in error_indicators:
            if indicator in page_text:
                print(f"   ⚠️  Found '{indicator}' in response")
        
        # Save response for manual inspection
        with open('delaware_response.html', 'w', encoding='utf-8') as f:
            f.write(search_response.text)
        print(f"\n💾 Response saved to 'delaware_response.html' for manual inspection")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_delaware_search("Apple Inc")
