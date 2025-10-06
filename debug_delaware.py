#!/usr/bin/env python3
"""
Debug script to investigate Delaware search behavior
"""

import requests
from bs4 import BeautifulSoup
import time
import random

def debug_delaware_search():
    """Debug the Delaware search to see what's happening"""
    
    # Create session with realistic headers
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    })
    
    print("🔍 Debugging Delaware Search for 'Google'")
    print("=" * 50)
    
    # Get the main search page first
    search_url = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
    print(f"📡 Fetching search page: {search_url}")
    response = session.get(search_url, timeout=30)
    print(f"✅ Response status: {response.status_code}")
    print(f"📄 Response length: {len(response.text)}")
    
    # Parse the form
    soup = BeautifulSoup(response.text, 'html.parser')
    form = soup.find('form')
    print(f"📝 Form found: {form is not None}")
    
    if form:
        # Look for hidden fields
        hidden_fields = form.find_all('input', type='hidden')
        print(f"🔒 Hidden fields found: {len(hidden_fields)}")
        for i, field in enumerate(hidden_fields[:5]):  # Show first 5
            name = field.get('name', 'No name')
            value = field.get('value', 'No value')[:50]
            print(f"   {i+1}. {name}: {value}...")
    
    # Add delay
    print("\n⏳ Waiting 3 seconds...")
    time.sleep(3)
    
    # Try a search for Google
    print("\n🔍 Searching for 'Google'...")
    
    form_data = {
        'ctl00$ContentPlaceHolder1$txtEntityName': 'Google',
        'ctl00$ContentPlaceHolder1$btnSearch': 'Search'
    }
    
    # Add hidden fields
    for hidden_input in form.find_all('input', type='hidden'):
        name = hidden_input.get('name')
        value = hidden_input.get('value', '')
        if name:
            form_data[name] = value
    
    print(f"📤 Form data keys: {list(form_data.keys())}")
    
    search_response = session.post(search_url, data=form_data, timeout=30)
    print(f"✅ Search response status: {search_response.status_code}")
    print(f"📄 Search response length: {len(search_response.text)}")
    
    # Analyze the response
    results_soup = BeautifulSoup(search_response.text, 'html.parser')
    page_text = results_soup.get_text().lower()
    
    print(f"\n📊 Page Analysis:")
    print(f"   Contains 'google': {'google' in page_text}")
    print(f"   Contains 'no records': {'no records' in page_text}")
    print(f"   Contains 'no results': {'no results' in page_text}")
    print(f"   Contains 'no entities': {'no entities' in page_text}")
    print(f"   Contains 'search returned': {'search returned' in page_text}")
    
    # Look for tables
    tables = results_soup.find_all('table')
    print(f"\n📋 Tables found: {len(tables)}")
    
    for i, table in enumerate(tables):
        table_text = table.get_text().lower()
        has_entity = 'entity' in table_text
        has_google = 'google' in table_text
        has_name = 'name' in table_text
        has_file = 'file' in table_text
        
        print(f"   Table {i+1}:")
        print(f"     - Contains 'entity': {has_entity}")
        print(f"     - Contains 'google': {has_google}")
        print(f"     - Contains 'name': {has_name}")
        print(f"     - Contains 'file': {has_file}")
        
        if has_entity or has_google:
            print(f"     - Table HTML preview: {str(table)[:200]}...")
    
    # Look for specific result table
    result_table = results_soup.find('table', {'id': 'ctl00_ContentPlaceHolder1_gvSearchResults'})
    if result_table:
        print(f"\n🎯 Found main results table!")
        rows = result_table.find_all('tr')
        print(f"   Rows: {len(rows)}")
        
        for i, row in enumerate(rows[:5]):  # Show first 5 rows
            cells = row.find_all('td')
            print(f"   Row {i+1}: {len(cells)} cells")
            for j, cell in enumerate(cells):
                text = cell.get_text(strip=True)
                if text:
                    print(f"     Cell {j+1}: {text[:50]}...")
    else:
        print(f"\n❌ Main results table not found")
    
    # Save response for inspection
    with open('delaware_response.html', 'w', encoding='utf-8') as f:
        f.write(search_response.text)
    print(f"\n💾 Response saved to delaware_response.html")

if __name__ == "__main__":
    debug_delaware_search()
