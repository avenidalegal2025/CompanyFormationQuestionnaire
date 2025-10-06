#!/usr/bin/env python3
"""
Simple ScrapeOps Test
This tests the ScrapeOps API with your credentials.
"""

import requests
import json

# Your ScrapeOps API key
API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
BASE_URL = "https://proxy.scrapeops.io/v1/"

def test_basic_connection():
    """Test basic ScrapeOps connection"""
    
    print("🔑 Testing Basic ScrapeOps Connection")
    print("=" * 50)
    
    # Test 1: Simple IP check
    print("🧪 Testing IP check...")
    response = requests.get(
        url=BASE_URL,
        params={
            'api_key': API_KEY,
            'url': 'https://httpbin.org/ip'
        }
    )
    
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print(f"✅ Success! Response: {response.text}")
    else:
        print(f"❌ Error: {response.text}")
    
    return response.status_code == 200

def test_delaware_get():
    """Test GET request to Delaware"""
    
    print("\n🏛️ Testing Delaware GET Request")
    print("=" * 50)
    
    response = requests.get(
        url=BASE_URL,
        params={
            'api_key': API_KEY,
            'url': 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx',
            'country': 'us'
        }
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response Length: {len(response.text)} characters")
    
    if response.status_code == 200:
        print("✅ Successfully accessed Delaware search page")
        
        # Check if we can find the search form
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        
        if form:
            print("✅ Found search form")
            
            # Count form fields
            form_fields = []
            for input_field in form.find_all('input'):
                name = input_field.get('name')
                if name:
                    form_fields.append(name)
            
            print(f"📝 Found {len(form_fields)} form fields")
            print("Form fields:", form_fields[:5], "..." if len(form_fields) > 5 else "")
        else:
            print("❌ Search form not found")
    else:
        print(f"❌ Error: {response.text}")
    
    return response.status_code == 200

def test_delaware_post():
    """Test POST request to Delaware"""
    
    print("\n📤 Testing Delaware POST Request")
    print("=" * 50)
    
    # First get the form data
    get_response = requests.get(
        url=BASE_URL,
        params={
            'api_key': API_KEY,
            'url': 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx',
            'country': 'us'
        }
    )
    
    if get_response.status_code != 200:
        print("❌ Failed to get form data")
        return False
    
    # Parse form
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(get_response.text, 'html.parser')
    form = soup.find('form')
    
    if not form:
        print("❌ No form found")
        return False
    
    # Extract form data
    form_data = {}
    for input_field in form.find_all('input'):
        name = input_field.get('name')
        value = input_field.get('value', '')
        if name:
            form_data[name] = value
    
    # Add search term
    form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = 'Test Company'
    form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
    
    print(f"📝 Form data prepared: {len(form_data)} fields")
    
    # Try different POST approaches
    approaches = [
        {
            'name': 'Method 1: POST with params',
            'method': 'POST',
            'params': {
                'api_key': API_KEY,
                'url': 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx',
                'country': 'us',
                'method': 'POST',
                'data': form_data
            }
        },
        {
            'name': 'Method 2: POST with JSON body',
            'method': 'POST',
            'json': {
                'api_key': API_KEY,
                'url': 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx',
                'country': 'us',
                'method': 'POST',
                'data': form_data
            }
        },
        {
            'name': 'Method 3: POST with form data',
            'method': 'POST',
            'data': {
                'api_key': API_KEY,
                'url': 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx',
                'country': 'us',
                'method': 'POST',
                **form_data
            }
        }
    ]
    
    for approach in approaches:
        print(f"\n🧪 Testing {approach['name']}...")
        
        try:
            if approach['method'] == 'POST':
                if 'json' in approach:
                    response = requests.post(BASE_URL, json=approach['json'], timeout=30)
                elif 'data' in approach:
                    response = requests.post(BASE_URL, data=approach['data'], timeout=30)
                else:
                    response = requests.post(BASE_URL, params=approach['params'], timeout=30)
            
            print(f"   Status Code: {response.status_code}")
            print(f"   Response Length: {len(response.text)} characters")
            
            if response.status_code == 200:
                print(f"   ✅ Success with {approach['name']}!")
                return True
            else:
                print(f"   ❌ Failed: {response.text[:200]}...")
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    return False

def main():
    """Main test function"""
    
    print("🚀 ScrapeOps Simple Test")
    print("=" * 60)
    
    # Test 1: Basic connection
    if test_basic_connection():
        print("\n🎉 Basic connection working!")
        
        # Test 2: Delaware GET
        if test_delaware_get():
            print("\n🎉 Delaware GET working!")
            
            # Test 3: Delaware POST
            if test_delaware_post():
                print("\n🎉 Delaware POST working!")
                print("\n✅ ScrapeOps is fully functional!")
            else:
                print("\n⚠️  Delaware POST not working - may need different approach")
        else:
            print("\n❌ Delaware GET failed")
    else:
        print("\n❌ Basic connection failed")

if __name__ == "__main__":
    main()
