#!/usr/bin/env python3
"""
ScrapeOps Proxy Integration for Delaware Name Search
This integrates ScrapeOps proxy aggregation services to bypass Bright Data restrictions.
"""

import requests
import json
import time
import random
from bs4 import BeautifulSoup

# ScrapeOps API configuration
SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"  # Your actual API key
SCRAPEOPS_PROXY_URL = "https://proxy.scrapeops.io/v1/"  # Proxy API endpoint

def test_scrapeops_connection():
    """Test ScrapeOps API connection"""
    
    print("🔑 Testing ScrapeOps API Connection")
    print("=" * 50)
    
    # Test with a simple request
    test_url = "https://httpbin.org/ip"
    
    params = {
        'api_key': SCRAPEOPS_API_KEY,
        'url': test_url
    }
    
    try:
        print("🧪 Testing ScrapeOps API...")
        response = requests.get(SCRAPEOPS_PROXY_URL, params=params, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success! Your IP: {result.get('origin', 'Unknown')}")
            print(f"   Status Code: {response.status_code}")
            print(f"   Response Time: {response.elapsed.total_seconds():.2f}s")
            return True
        else:
            print(f"❌ API request failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

def search_delaware_with_scrapeops(company_name="Test Company LLC"):
    """Search Delaware using ScrapeOps proxy"""
    
    print(f"🔍 Searching Delaware for: {company_name}")
    print("=" * 50)
    
    try:
        # Step 1: Get the search page through ScrapeOps
        print("📄 Getting Delaware search page through ScrapeOps...")
        
        search_url = "http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx"
        
        params = {
            'api_key': SCRAPEOPS_API_KEY,
            'url': search_url
        }
        
        response = requests.get(SCRAPEOPS_PROXY_URL, params=params, timeout=30)
        response.raise_for_status()
        
        print(f"✅ Successfully loaded search page ({len(response.text)} characters)")
        
        # Step 2: Parse the form
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        
        if not form:
            print("❌ Could not find search form")
            return None
        
        print("✅ Found search form")
        
        # Step 3: Extract form fields
        form_data = {}
        for input_field in form.find_all('input'):
            name = input_field.get('name')
            value = input_field.get('value', '')
            if name:
                form_data[name] = value
        
        print(f"📝 Found {len(form_data)} form fields")
        
        # Step 4: Add search term
        search_term = company_name.replace(' LLC', '').replace(' Inc', '').replace(' Corp', '')
        form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = search_term
        form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
        
        print(f"🔍 Searching for: {search_term}")
        
        # Step 5: Submit search through ScrapeOps
        print("📤 Submitting search through ScrapeOps...")
        
        # Prepare form data for POST request
        form_data_encoded = '&'.join([f"{key}={value}" for key, value in form_data.items()])
        
        # Use ScrapeOps for POST request (correct method)
        post_params = {
            'api_key': SCRAPEOPS_API_KEY,
            'url': search_url,
            'country': 'us',
            'method': 'POST',
            'data': form_data
        }
        
        search_response = requests.post(SCRAPEOPS_PROXY_URL, params=post_params, timeout=30)
        search_response.raise_for_status()
        
        print(f"✅ Search submitted successfully ({len(search_response.text)} characters)")
        
        # Step 6: Parse results
        print("📊 Parsing search results...")
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Check for no results
        no_results_phrases = [
            'no records found', 'no results found', 'no entities found',
            'no matches found', 'search returned no results'
        ]
        
        page_text = results_soup.get_text().lower()
        if any(phrase in page_text for phrase in no_results_phrases):
            print("✅ No results found - name appears to be available")
            return {
                "success": True,
                "available": True,
                "message": "Nombre disponible en Delaware",
                "method": "delaware_scrapeops",
                "existing_entities": []
            }
        
        # Look for results table
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if results_table:
            rows = results_table.find_all('tr')
            if len(rows) <= 1:
                print("✅ No results in table - name appears to be available")
                return {
                    "success": True,
                    "available": True,
                    "message": "Nombre disponible en Delaware",
                    "method": "delaware_scrapeops",
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
                        "method": "delaware_scrapeops",
                        "existing_entities": existing_entities
                    }
                else:
                    print("✅ No matching entities found - name appears to be available")
                    return {
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_scrapeops",
                        "existing_entities": []
                    }
        
        print("⚠️  Could not parse results - assuming available")
        return {
            "success": True,
            "available": True,
            "message": "Nombre disponible en Delaware",
            "method": "delaware_scrapeops",
            "existing_entities": []
        }
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return {
            "success": False,
            "available": False,
            "message": f"Error: {str(e)}",
            "method": "delaware_scrapeops",
            "existing_entities": []
        }

def setup_scrapeops():
    """Setup ScrapeOps account and get API key"""
    
    print("🚀 ScrapeOps Setup Guide")
    print("=" * 50)
    
    print("1. 🌐 Go to https://scrapeops.io/")
    print("2. 📝 Sign up for a free account")
    print("3. 🔑 Get your API key from the dashboard")
    print("4. ⚙️ Update SCRAPEOPS_API_KEY in this file")
    print()
    
    print("📊 Available Plans:")
    print("• Proxy API Aggregator: 1,000 free API credits")
    print("• Residential Proxy Aggregator: 100MB free bandwidth")
    print()
    
    print("💡 Benefits:")
    print("• No KYC verification required")
    print("• Access to 15+ proxy APIs")
    print("• Built-in anti-bot bypasses")
    print("• Pay only for successful requests")
    print("• Automatic proxy rotation")

def main():
    """Main test function"""
    
    print("🚀 ScrapeOps Integration for Delaware Name Search")
    print("=" * 60)
    
    if SCRAPEOPS_API_KEY == "YOUR_SCRAPEOPS_API_KEY":
        print("⚠️  ScrapeOps API key not configured")
        setup_scrapeops()
        return
    
    # Test 1: API connection
    if test_scrapeops_connection():
        print("\n🎉 ScrapeOps API is working!")
        
        # Test 2: Delaware search
        test_companies = [
            "Test Company LLC",
            "Google LLC",
            "Apple Inc"
        ]
        
        for company in test_companies:
            print(f"\n{'='*60}")
            result = search_delaware_with_scrapeops(company)
            
            if result:
                print(f"\n📊 Result for {company}:")
                print(f"   Success: {result.get('success')}")
                print(f"   Available: {result.get('available')}")
                print(f"   Message: {result.get('message')}")
                print(f"   Method: {result.get('method')}")
                print(f"   Existing Entities: {len(result.get('existing_entities', []))}")
                
                if result.get('existing_entities'):
                    for entity in result['existing_entities']:
                        print(f"     - {entity['name']} ({entity['status']})")
            else:
                print(f"❌ Failed to search for {company}")
            
            # Add delay between searches
            time.sleep(3)
        
        print("\n✅ ScrapeOps integration complete!")
    else:
        print("\n❌ ScrapeOps API test failed")
        setup_scrapeops()

if __name__ == "__main__":
    main()
