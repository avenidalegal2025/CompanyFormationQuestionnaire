#!/usr/bin/env python3
"""
Debug Google LLC Search
This script specifically debugs the Google LLC search to find out why it's not being detected.
"""

import requests
from bs4 import BeautifulSoup
import time
import random

def debug_google_search():
    """Debug the Google LLC search specifically"""
    
    print("🔍 Debugging Google LLC Search")
    print("=" * 50)
    
    try:
        # Create session with direct connection
        session = requests.Session()
        
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
        print("📄 Getting Delaware search page...")
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Length: {len(response.text)} characters")
        
        # Step 2: Parse the form
        print("\n📝 Parsing search form...")
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        
        if not form:
            print("   ❌ No form found!")
            return
        
        print("   ✅ Form found")
        
        # Step 3: Extract form fields
        print("\n🔍 Extracting form fields...")
        form_data = {}
        for input_field in form.find_all('input'):
            name = input_field.get('name')
            value = input_field.get('value', '')
            if name:
                form_data[name] = value
        
        print(f"   Found {len(form_data)} form fields")
        
        # Step 4: Try different search terms for Google
        search_terms = [
            'Google LLC',
            'Google',
            'GOOGLE LLC',
            'google llc',
            'Google, LLC',
            'Google Inc',
            'Alphabet Inc'
        ]
        
        for search_term in search_terms:
            print(f"\n🔍 Testing search term: '{search_term}'")
            print("-" * 40)
            
            # Prepare form data
            test_form_data = form_data.copy()
            test_form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = search_term
            test_form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
            
            # Submit search
            print("   📤 Submitting search...")
            search_response = session.post(search_url, data=test_form_data, timeout=30)
            search_response.raise_for_status()
            
            print(f"   Status Code: {search_response.status_code}")
            print(f"   Response Length: {len(search_response.text)} characters")
            
            # Parse results
            results_soup = BeautifulSoup(search_response.text, 'html.parser')
            
            # Check for results table
            results_table = results_soup.find('table', {'id': 'tblResults'})
            if results_table:
                rows = results_table.find_all('tr')
                print(f"   📊 Results table found with {len(rows)} rows")
                
                if len(rows) > 1:
                    print("   ✅ Found results!")
                    for i, row in enumerate(rows[1:], 1):
                        cells = row.find_all('td')
                        if cells:
                            file_number = cells[0].get_text(strip=True)
                            entity_name = cells[1].get_text(strip=True)
                            print(f"     Row {i}: {file_number} - {entity_name}")
                else:
                    print("   ❌ No results in table")
            else:
                print("   ❌ No results table found")
                
                # Check for error messages
                page_text = results_soup.get_text().lower()
                if 'no records found' in page_text:
                    print("   📝 'No records found' message detected")
                elif 'no results found' in page_text:
                    print("   📝 'No results found' message detected")
                elif 'error' in page_text:
                    print("   ⚠️  Error message detected")
                    # Show first 200 chars of response
                    print(f"   Response preview: {search_response.text[:200]}...")
            
            # Add delay between searches
            time.sleep(2)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_google_search()
