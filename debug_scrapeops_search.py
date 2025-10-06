#!/usr/bin/env python3
"""
Debug ScrapeOps Search
This script debugs the search process with ScrapeOps proxy to find out why Google LLC isn't being found.
"""

import requests
from bs4 import BeautifulSoup
import time
import random

# ScrapeOps configuration
SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
SCRAPEOPS_PROXY = f"http://scrapeops.headless_browser_mode=true:{SCRAPEOPS_API_KEY}@proxy.scrapeops.io:5353"

def debug_scrapeops_search(company_name="Google LLC"):
    """Debug the search process with ScrapeOps proxy"""
    
    print(f"🔍 Debugging ScrapeOps Search for: {company_name}")
    print("=" * 60)
    
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
        
        # Step 1: Get the search page
        print("📄 Step 1: Getting Delaware search page through ScrapeOps...")
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        print(f"   Status: {response.status_code}")
        print(f"   Length: {len(response.text)} characters")
        
        # Check for ban indicators
        if 'error occurred while processing' in response.text.lower():
            print("   ❌ BAN DETECTED: Error message found")
            return
        elif 'auth failed' in response.text.lower():
            print("   ❌ PROXY ERROR: Auth failed message found")
            return
        else:
            print("   ✅ Access successful")
        
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
        
        print(f"   Found {len(form_data)} form fields")
        
        # Step 4: Try different search approaches
        search_terms = [
            'Google LLC',
            'Google',
            'GOOGLE LLC', 
            'google llc',
            'Google, LLC',
            'Alphabet Inc',
            'Alphabet LLC'
        ]
        
        for search_term in search_terms:
            print(f"\n🔍 Step 4: Testing search term: '{search_term}'")
            print("-" * 50)
            
            # Prepare form data
            test_form_data = form_data.copy()
            test_form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = search_term
            test_form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
            
            print(f"   Form data prepared with search term: '{search_term}'")
            
            # Add delay
            delay = random.uniform(2, 5)
            print(f"   ⏱️  Waiting {delay:.1f} seconds...")
            time.sleep(delay)
            
            # Submit search
            print("   📤 Submitting search...")
            search_response = session.post(search_url, data=test_form_data, timeout=30)
            search_response.raise_for_status()
            
            print(f"   Status: {search_response.status_code}")
            print(f"   Length: {len(search_response.text)} characters")
            
            # Check for errors
            if 'error occurred while processing' in search_response.text.lower():
                print("   ❌ BAN DETECTED: Error message found")
                continue
            elif 'auth failed' in search_response.text.lower():
                print("   ❌ PROXY ERROR: Auth failed message found")
                continue
            
            # Parse results
            results_soup = BeautifulSoup(search_response.text, 'html.parser')
            
            # Look for results table
            results_table = results_soup.find('table', {'id': 'tblResults'})
            if results_table:
                rows = results_table.find_all('tr')
                print(f"   📊 Results table found with {len(rows)} rows")
                
                if len(rows) > 1:
                    print("   ✅ FOUND RESULTS!")
                    for i, row in enumerate(rows[1:], 1):
                        cells = row.find_all('td')
                        if cells:
                            file_number = cells[0].get_text(strip=True)
                            entity_name = cells[1].get_text(strip=True)
                            print(f"     {i}. {file_number} - {entity_name}")
                    
                    # Save successful response
                    with open(f'successful_search_{search_term.replace(" ", "_")}.html', 'w', encoding='utf-8') as f:
                        f.write(search_response.text)
                    print(f"   💾 Response saved to successful_search_{search_term.replace(' ', '_')}.html")
                    return True
                else:
                    print("   ❌ No results in table")
            else:
                print("   ❌ No results table found")
                
                # Check for other indicators
                page_text = results_soup.get_text().lower()
                if 'no records found' in page_text:
                    print("   📝 'No records found' message")
                elif 'no results found' in page_text:
                    print("   📝 'No results found' message")
                else:
                    print("   📝 No specific 'no results' message found")
            
            # Add delay between searches
            time.sleep(3)
        
        print("\n❌ No results found with any search term")
        return False
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    debug_scrapeops_search("Google LLC")
