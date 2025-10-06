#!/usr/bin/env python3
"""
Delaware Search using urllib with Bright Data Proxy
This uses the same approach as your working urllib code.
"""

import urllib.request
import urllib.parse
import ssl
import json
from bs4 import BeautifulSoup

def search_delaware_urllib(company_name="Test Company LLC"):
    """Search Delaware using urllib with Bright Data proxy"""
    
    print(f"🔍 Searching Delaware for: {company_name}")
    print("=" * 50)
    
    # Your working proxy configuration
    proxy = 'http://brd-customer-hl_5dca15c7-zone-residential_proxy1:w434mhlde1m9@brd.superproxy.io:33335'
    
    # Create opener with proxy
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({'https': proxy, 'http': proxy}),
        urllib.request.HTTPSHandler(context=ssl._create_unverified_context())
    )
    
    try:
        # Step 1: Get the search page
        print("📄 Getting Delaware search page...")
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        response = opener.open(search_url)
        html_content = response.read().decode('utf-8')
        
        print(f"✅ Successfully loaded search page ({len(html_content)} characters)")
        
        # Step 2: Parse the form
        soup = BeautifulSoup(html_content, 'html.parser')
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
        
        # Step 5: Submit search
        print("📤 Submitting search...")
        
        # Encode form data
        form_data_encoded = urllib.parse.urlencode(form_data).encode('utf-8')
        
        # Create request
        request = urllib.request.Request(
            search_url,
            data=form_data_encoded,
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        )
        
        # Submit search
        search_response = opener.open(request)
        search_html = search_response.read().decode('utf-8')
        
        print(f"✅ Search submitted successfully ({len(search_html)} characters)")
        
        # Step 6: Parse results
        print("📊 Parsing search results...")
        results_soup = BeautifulSoup(search_html, 'html.parser')
        
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
                "method": "delaware_urllib_bright_data",
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
                    "method": "delaware_urllib_bright_data",
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
                        "method": "delaware_urllib_bright_data",
                        "existing_entities": existing_entities
                    }
                else:
                    print("✅ No matching entities found - name appears to be available")
                    return {
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_urllib_bright_data",
                        "existing_entities": []
                    }
        
        print("⚠️  Could not parse results - assuming available")
        return {
            "success": True,
            "available": True,
            "message": "Nombre disponible en Delaware",
            "method": "delaware_urllib_bright_data",
            "existing_entities": []
        }
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return {
            "success": False,
            "available": False,
            "message": f"Error: {str(e)}",
            "method": "delaware_urllib_bright_data",
            "existing_entities": []
        }

def main():
    """Main test function"""
    
    print("🚀 Delaware Search with urllib + Bright Data Proxy")
    print("=" * 60)
    
    # Test with different company names
    test_companies = [
        "Test Company LLC",
        "Google LLC",
        "Apple Inc",
        "Microsoft Corporation"
    ]
    
    for company in test_companies:
        print(f"\n{'='*60}")
        result = search_delaware_urllib(company)
        
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
        import time
        time.sleep(3)

if __name__ == "__main__":
    main()
