#!/usr/bin/env python3
"""
Manual test to debug Delaware form submission
"""

import requests
from bs4 import BeautifulSoup
import time
import re

def test_delaware_manual():
    """Test Delaware search with more detailed debugging"""
    
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    })
    
    print("🔍 Manual Delaware Search Test")
    print("=" * 40)
    
    # Step 1: Get the search page
    search_url = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
    print(f"1. Getting search page...")
    response = session.get(search_url, timeout=30)
    print(f"   Status: {response.status_code}")
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Step 2: Find the form and input field
    form = soup.find('form')
    if not form:
        print("   ❌ No form found!")
        return
    
    print(f"   ✅ Form found: {form.get('id', 'No ID')}")
    
    # Find the text input
    text_input = soup.find('input', {'id': 'ctl00_ContentPlaceHolder1_txtEntityName'})
    if not text_input:
        print("   ❌ Text input not found!")
        return
    
    print(f"   ✅ Text input found: {text_input.get('name', 'No name')}")
    
    # Step 3: Check for validation requirements
    print(f"\n2. Checking validation requirements...")
    
    # Look for required field indicators
    required_span = soup.find('span', {'id': 'ctl00_ContentPlaceHolder1_lblError'})
    if required_span:
        print(f"   Required field span: {required_span.get_text(strip=True)}")
    
    # Look for validation scripts
    scripts = soup.find_all('script')
    validation_found = False
    for script in scripts:
        if script.string and 'validation' in script.string.lower():
            validation_found = True
            print(f"   ✅ Validation script found")
            break
    
    if not validation_found:
        print(f"   ℹ️  No validation scripts found")
    
    # Step 4: Try a simple search
    print(f"\n3. Attempting search for 'Google'...")
    
    # Get all hidden fields
    hidden_fields = {}
    for hidden_input in form.find_all('input', type='hidden'):
        name = hidden_input.get('name')
        value = hidden_input.get('value', '')
        if name:
            hidden_fields[name] = value
    
    print(f"   Hidden fields: {len(hidden_fields)}")
    
    # Prepare form data
    form_data = {
        'ctl00$ContentPlaceHolder1$txtEntityName': 'Google',
        'ctl00$ContentPlaceHolder1$btnSearch': 'Search'
    }
    
    # Add all hidden fields
    form_data.update(hidden_fields)
    
    print(f"   Form data keys: {len(form_data)}")
    
    # Submit the form
    time.sleep(2)
    search_response = session.post(search_url, data=form_data, timeout=30)
    print(f"   Search response status: {search_response.status_code}")
    print(f"   Response length: {len(search_response.text)}")
    
    # Step 5: Analyze the response
    print(f"\n4. Analyzing response...")
    
    results_soup = BeautifulSoup(search_response.text, 'html.parser')
    
    # Check if we got the same page back
    original_title = soup.find('title')
    result_title = results_soup.find('title')
    
    if original_title and result_title:
        if original_title.get_text() == result_title.get_text():
            print(f"   ⚠️  Got same page back - form submission may have failed")
        else:
            print(f"   ✅ Got different page - form submission worked")
    
    # Look for any error messages
    error_elements = results_soup.find_all(['span', 'div'], class_=re.compile(r'error', re.I))
    if error_elements:
        print(f"   Error elements found: {len(error_elements)}")
        for elem in error_elements[:3]:
            text = elem.get_text(strip=True)
            if text:
                print(f"     - {text}")
    
    # Look for the text input value
    result_text_input = results_soup.find('input', {'id': 'ctl00_ContentPlaceHolder1_txtEntityName'})
    if result_text_input:
        value = result_text_input.get('value', '')
        print(f"   Text input value: '{value}'")
        if value == 'Google':
            print(f"   ✅ Search term preserved")
        else:
            print(f"   ❌ Search term not preserved")
    
    # Look for any results
    page_text = results_soup.get_text().lower()
    if 'google' in page_text:
        print(f"   ✅ 'Google' found in response")
    else:
        print(f"   ❌ 'Google' not found in response")
    
    # Check for tables with results
    tables = results_soup.find_all('table')
    result_tables = []
    for table in tables:
        table_text = table.get_text().lower()
        if 'entity' in table_text and 'name' in table_text:
            result_tables.append(table)
    
    print(f"   Result tables found: {len(result_tables)}")
    
    if result_tables:
        print(f"   ✅ Found potential results table")
        for i, table in enumerate(result_tables):
            rows = table.find_all('tr')
            print(f"     Table {i+1}: {len(rows)} rows")
    else:
        print(f"   ❌ No results tables found")

if __name__ == "__main__":
    test_delaware_manual()
