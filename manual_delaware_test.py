#!/usr/bin/env python3
"""
Manual Delaware Test
This script manually tests the Delaware search to see what's actually happening.
"""

import requests
from bs4 import BeautifulSoup
import time

def manual_delaware_test():
    """Manually test Delaware search step by step"""
    
    print("🔍 Manual Delaware Search Test")
    print("=" * 50)
    
    try:
        # Create session
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
        print("📄 Step 1: Getting Delaware search page...")
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        print(f"   Status: {response.status_code}")
        print(f"   Length: {len(response.text)} characters")
        
        # Step 2: Parse the form
        print("\n📝 Step 2: Parsing form...")
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        
        if not form:
            print("   ❌ No form found!")
            return
        
        print("   ✅ Form found")
        
        # Step 3: Look at the form structure
        print("\n🔍 Step 3: Analyzing form structure...")
        
        # Find all input fields
        inputs = form.find_all('input')
        print(f"   Found {len(inputs)} input fields:")
        
        for i, input_field in enumerate(inputs):
            name = input_field.get('name', 'no-name')
            input_type = input_field.get('type', 'text')
            value = input_field.get('value', '')
            print(f"     {i+1}. {name} ({input_type}) = '{value[:50]}...'")
        
        # Find the search input specifically
        search_input = form.find('input', {'name': 'ctl00$ContentPlaceHolder1$frmEntityName'})
        if search_input:
            print(f"\n   ✅ Found search input: {search_input.get('name')}")
        else:
            print(f"\n   ❌ Search input not found!")
            # Look for any input that might be the search field
            for input_field in inputs:
                name = input_field.get('name', '')
                if 'entity' in name.lower() or 'name' in name.lower():
                    print(f"     Potential search field: {name}")
        
        # Step 4: Try a simple search
        print(f"\n🔍 Step 4: Trying simple search for 'Google'...")
        
        # Prepare form data
        form_data = {}
        for input_field in inputs:
            name = input_field.get('name')
            value = input_field.get('value', '')
            if name:
                form_data[name] = value
        
        # Set search term
        form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = 'Google'
        form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
        
        print(f"   Form data keys: {list(form_data.keys())}")
        print(f"   Search term set to: '{form_data.get('ctl00$ContentPlaceHolder1$frmEntityName')}'")
        
        # Submit search
        print("   📤 Submitting search...")
        search_response = session.post(search_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        
        print(f"   Status: {search_response.status_code}")
        print(f"   Length: {len(search_response.text)} characters")
        
        # Step 5: Analyze the response
        print(f"\n📊 Step 5: Analyzing response...")
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Look for the results table
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if results_table:
            print("   ✅ Results table found")
            rows = results_table.find_all('tr')
            print(f"   Rows: {len(rows)}")
            
            if len(rows) > 1:
                print("   📋 Results found:")
                for i, row in enumerate(rows[1:], 1):
                    cells = row.find_all('td')
                    if cells:
                        file_number = cells[0].get_text(strip=True)
                        entity_name = cells[1].get_text(strip=True)
                        print(f"     {i}. {file_number} - {entity_name}")
            else:
                print("   ❌ No results in table")
        else:
            print("   ❌ No results table found")
            
            # Look for any tables
            all_tables = results_soup.find_all('table')
            print(f"   Found {len(all_tables)} tables total")
            for i, table in enumerate(all_tables):
                table_id = table.get('id', 'no-id')
                rows = table.find_all('tr')
                print(f"     Table {i+1}: id='{table_id}', rows={len(rows)}")
        
        # Step 6: Check for error messages
        print(f"\n🚨 Step 6: Checking for messages...")
        page_text = results_soup.get_text()
        
        # Look for specific messages
        messages = [
            'no records found',
            'no results found', 
            'no entities found',
            'search returned no results',
            'error',
            'invalid',
            'failed'
        ]
        
        for msg in messages:
            if msg.lower() in page_text.lower():
                print(f"   ⚠️  Found '{msg}' in response")
        
        # Save the response for inspection
        with open('manual_delaware_response.html', 'w', encoding='utf-8') as f:
            f.write(search_response.text)
        print(f"\n💾 Response saved to 'manual_delaware_response.html'")
        
        # Step 7: Try different search approaches
        print(f"\n🔄 Step 7: Trying different search approaches...")
        
        # Try with different search terms
        test_terms = ['Google LLC', 'GOOGLE', 'google llc', 'Google, LLC']
        
        for term in test_terms:
            print(f"\n   Testing: '{term}'")
            test_form_data = form_data.copy()
            test_form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = term
            test_form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
            
            test_response = session.post(search_url, data=test_form_data, timeout=30)
            test_soup = BeautifulSoup(test_response.text, 'html.parser')
            test_table = test_soup.find('table', {'id': 'tblResults'})
            
            if test_table:
                test_rows = test_table.find_all('tr')
                if len(test_rows) > 1:
                    print(f"     ✅ Found {len(test_rows)-1} results!")
                    for i, row in enumerate(test_rows[1:3], 1):  # Show first 2
                        cells = row.find_all('td')
                        if cells:
                            file_number = cells[0].get_text(strip=True)
                            entity_name = cells[1].get_text(strip=True)
                            print(f"       {i}. {file_number} - {entity_name}")
                    break
                else:
                    print(f"     ❌ No results")
            else:
                print(f"     ❌ No table found")
            
            time.sleep(1)  # Be nice to the server
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    manual_delaware_test()
