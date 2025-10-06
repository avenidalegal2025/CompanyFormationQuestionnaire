#!/usr/bin/env python3
"""
Bright Data API Client
This script uses the Bright Data API directly instead of proxy authentication.
"""

import requests
import json
import time
import random
from bs4 import BeautifulSoup

# Your Bright Data API key
BRIGHT_DATA_API_KEY = "f5f4ffcfb1755077eb3a27f809ab8b4985160d0dedbc4de11405a43b8c4d0b4a"
BRIGHT_DATA_API_URL = "https://api.brightdata.com/request"

def test_bright_data_api():
    """Test Bright Data API connection"""
    
    print("🔑 Testing Bright Data API")
    print("=" * 50)
    
    headers = {
        'Authorization': f'Bearer {BRIGHT_DATA_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    # Test with a simple request
    data = {
        "zone": "default",  # You may need to change this
        "url": "https://httpbin.org/ip",
        "format": "json",
        "method": "GET",
        "country": "us"
    }
    
    try:
        print("🧪 Testing API connection...")
        response = requests.post(BRIGHT_DATA_API_URL, headers=headers, json=data, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}...")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ API connection successful!")
            return True
        else:
            print(f"❌ API request failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ API test failed: {e}")
        return False

def search_delaware_with_api(company_name, entity_type="LLC"):
    """Search Delaware using Bright Data API"""
    
    print(f"\n🏛️ Searching Delaware for: {company_name}")
    print("=" * 50)
    
    headers = {
        'Authorization': f'Bearer {BRIGHT_DATA_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    # Search Delaware website
    data = {
        "zone": "default",  # You may need to change this
        "url": "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx",
        "format": "html",
        "method": "GET",
        "country": "us"
    }
    
    try:
        print("🔍 Fetching Delaware search page...")
        response = requests.post(BRIGHT_DATA_API_URL, headers=headers, json=data, timeout=60)
        
        if response.status_code == 200:
            print("✅ Successfully fetched Delaware search page")
            
            # Parse the HTML response
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Look for the search form
            form = soup.find('form')
            if form:
                print("✅ Found search form")
                
                # Extract form fields
                form_fields = {}
                for input_field in form.find_all('input'):
                    name = input_field.get('name')
                    value = input_field.get('value', '')
                    if name:
                        form_fields[name] = value
                
                print(f"📝 Found {len(form_fields)} form fields")
                
                # Now perform the search
                return perform_delaware_search(company_name, form_fields)
            else:
                print("❌ Search form not found")
                return None
        else:
            print(f"❌ Failed to fetch Delaware page: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Delaware search failed: {e}")
        return None

def perform_delaware_search(company_name, form_fields):
    """Perform the actual search on Delaware website"""
    
    print(f"\n🔍 Performing search for: {company_name}")
    print("=" * 50)
    
    headers = {
        'Authorization': f'Bearer {BRIGHT_DATA_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    # Prepare form data for search
    search_data = form_fields.copy()
    
    # Add search term (you may need to adjust the field name)
    search_fields = [
        'ctl00$ContentPlaceHolder1$frmEntityName',
        'ctl00$ContentPlaceHolder1$txtEntityName',
        'SearchTerm',
        'entityName'
    ]
    
    search_term_added = False
    for field in search_fields:
        if field in search_data:
            search_data[field] = company_name
            search_term_added = True
            print(f"✅ Added search term to field: {field}")
            break
    
    if not search_term_added:
        print("⚠️  Could not find search field, using first available field")
        if search_data:
            first_field = list(search_data.keys())[0]
            search_data[first_field] = company_name
            print(f"✅ Added search term to field: {first_field}")
    
    # Submit search
    data = {
        "zone": "default",
        "url": "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx",
        "format": "html",
        "method": "POST",
        "country": "us",
        "data": search_data
    }
    
    try:
        print("📤 Submitting search...")
        response = requests.post(BRIGHT_DATA_API_URL, headers=headers, json=data, timeout=60)
        
        if response.status_code == 200:
            print("✅ Search submitted successfully")
            
            # Parse results
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Look for results table
            results_table = soup.find('table', {'id': 'tblResults'})
            if results_table:
                print("✅ Found results table")
                return parse_search_results(soup, company_name)
            else:
                print("⚠️  No results table found")
                return {"success": True, "available": True, "message": "No results found"}
        else:
            print(f"❌ Search failed: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Search submission failed: {e}")
        return None

def parse_search_results(soup, company_name):
    """Parse search results from Delaware website"""
    
    print("📊 Parsing search results...")
    
    # Look for "no results" messages
    no_results_phrases = [
        'no records found', 'no results found', 'no entities found',
        'no matches found', 'search returned no results'
    ]
    
    page_text = soup.get_text().lower()
    if any(phrase in page_text for phrase in no_results_phrases):
        print("✅ No results found - name appears to be available")
        return {
            "success": True,
            "available": True,
            "message": "Nombre disponible en Delaware",
            "method": "bright_data_api",
            "existing_entities": []
        }
    
    # Look for results table
    results_table = soup.find('table', {'id': 'tblResults'})
    if results_table:
        rows = results_table.find_all('tr')
        if len(rows) <= 1:
            print("✅ No results in table - name appears to be available")
            return {
                "success": True,
                "available": True,
                "message": "Nombre disponible en Delaware",
                "method": "bright_data_api",
                "existing_entities": []
            }
        else:
            print(f"📋 Found {len(rows)-1} results")
            
            # Parse results
            existing_entities = []
            for i, row in enumerate(rows[1:], 1):
                cells = row.find_all('td')
                if len(cells) >= 2:
                    file_number = cells[0].get_text(strip=True)
                    corporate_name = cells[1].get_text(strip=True)
                    status = "ACTIVE"  # Assuming active
                    
                    existing_entities.append({
                        'name': corporate_name,
                        'status': status,
                        'file_number': file_number
                    })
            
            if existing_entities:
                print(f"❌ Found {len(existing_entities)} existing entities")
                return {
                    "success": True,
                    "available": False,
                    "message": "Nombre no disponible en Delaware, intenta otro.",
                    "method": "bright_data_api",
                    "existing_entities": existing_entities
                }
            else:
                print("✅ No matching entities found - name appears to be available")
                return {
                    "success": True,
                    "available": True,
                    "message": "Nombre disponible en Delaware",
                    "method": "bright_data_api",
                    "existing_entities": []
                }
    
    print("⚠️  Could not parse results - assuming available")
    return {
        "success": True,
        "available": True,
        "message": "Nombre disponible en Delaware",
        "method": "bright_data_api",
        "existing_entities": []
    }

def main():
    """Main function to test Bright Data API"""
    
    print("🚀 Bright Data API Client Test")
    print("=" * 60)
    
    # Test 1: API connection
    if test_bright_data_api():
        print("\n🎉 Bright Data API is working!")
        
        # Test 2: Delaware search
        test_companies = [
            "Test Company LLC",
            "Google LLC",
            "Apple Inc"
        ]
        
        for company in test_companies:
            result = search_delaware_with_api(company)
            if result:
                print(f"\n📊 Result for {company}:")
                print(f"   Success: {result.get('success')}")
                print(f"   Available: {result.get('available')}")
                print(f"   Message: {result.get('message')}")
                print(f"   Method: {result.get('method')}")
                print(f"   Existing Entities: {len(result.get('existing_entities', []))}")
            else:
                print(f"❌ Failed to search for {company}")
            
            # Add delay between searches
            time.sleep(5)
        
        print("\n✅ Bright Data API integration complete!")
    else:
        print("\n❌ Bright Data API test failed")
        print("\nTroubleshooting:")
        print("1. Check if your API key is correct")
        print("2. Verify your Bright Data account is active")
        print("3. Check if you have API access enabled")
        print("4. Contact Bright Data support if needed")

if __name__ == "__main__":
    main()
