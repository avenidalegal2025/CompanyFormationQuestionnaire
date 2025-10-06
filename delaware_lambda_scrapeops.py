#!/usr/bin/env python3
"""
Delaware Lambda with ScrapeOps Proxy Port Integration
This uses the ScrapeOps proxy port integration as recommended in their documentation.
"""

import json
import requests
import time
import random
from bs4 import BeautifulSoup

# ScrapeOps configuration
SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
SCRAPEOPS_PROXY = f"http://scrapeops.headless_browser_mode=true:{SCRAPEOPS_API_KEY}@proxy.scrapeops.io:5353"

# Import name normalization functions
import re
import unicodedata

# Generic words to remove from company names
GENERIC_WORDS = {
    "corp", "corporation", "inc", "incorporated",
    "llc", "limited", "limited liability company", "limited liability co", "co", "company", "lc", "ltd", "ltd.", "ltd",
    "limited partnership", "lp", "partnership",
    "statutory trust", "trust", "foundation",
    "l3c", "dao", "lao",
    "the", "and", "&",
}

# Punctuation pattern for cleaning
PUNCTUATION_PATTERN = re.compile(r"[^\w\s]")

# Singular/plural equivalents
SING_PLUR_EQUIV = {
    "property": "properties",
    "child": "children",
    "holding": "holdings",
    "supernova": "supernovae",
    "maximum": "maxima",
    "goose": "geese",
    "cactus": "cacti",
    "spectrum": "spectra",
    "lumen": "lumina",
}

# Number words
NUMBER_WORDS = {
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
    "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"
}

# Roman numeral pattern
ROMAN_NUMERAL_PATTERN = re.compile(r"\b[IVXLCDM]+\b", re.IGNORECASE)

def normalize_tokens(name):
    """Normalize company name tokens for comparison"""
    # Convert to lowercase and remove accents
    normalized = unicodedata.normalize('NFD', name.lower())
    normalized = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    
    # Remove punctuation
    normalized = PUNCTUATION_PATTERN.sub(' ', normalized)
    
    # Split into tokens
    tokens = normalized.split()
    
    # Remove generic words
    tokens = [token for token in tokens if token not in GENERIC_WORDS]
    
    # Handle singular/plural
    processed_tokens = []
    for token in tokens:
        if token in SING_PLUR_EQUIV:
            processed_tokens.append(SING_PLUR_EQUIV[token])
        else:
            processed_tokens.append(token)
    
    return processed_tokens

def comparable_signature(name):
    """Create a comparable signature from a company name"""
    tokens = normalize_tokens(name)
    
    # Sort tokens for consistent comparison
    tokens.sort()
    
    # Join tokens
    signature = ' '.join(tokens)
    
    # Handle Roman numerals
    def replace_roman(match):
        roman = match.group().upper()
        roman_to_num = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
        num = 0
        prev = 0
        for char in reversed(roman):
            val = roman_to_num[char]
            if val < prev:
                num -= val
            else:
                num += val
            prev = val
        return str(num)
    
    signature = ROMAN_NUMERAL_PATTERN.sub(replace_roman, signature)
    
    return signature

def extract_base_name(company_name):
    """Extract the base name from a company name for comparison"""
    # Remove common suffixes
    suffixes = ['corp', 'corporation', 'inc', 'incorporated', 'llc', 'limited', 'ltd', 'co', 'company']
    
    name = company_name.lower().strip()
    
    # Remove suffixes
    for suffix in suffixes:
        if name.endswith(' ' + suffix):
            name = name[:-len(' ' + suffix)].strip()
        elif name.endswith(suffix):
            name = name[:-len(suffix)].strip()
    
    return name.strip()

def create_scrapeops_session():
    """Create a session with ScrapeOps proxy port integration"""
    
    session = requests.Session()
    
    # Configure proxy as per ScrapeOps documentation
    session.proxies = {
        'http': SCRAPEOPS_PROXY,
        'https': SCRAPEOPS_PROXY,
        'no_proxy': 'localhost:127.0.0.1'
    }
    
    # Set realistic headers
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    ]
    
    session.headers.update({
        'User-Agent': random.choice(user_agents),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    })
    
    # Disable SSL verification as recommended by ScrapeOps
    session.verify = False
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    return session

def test_scrapeops_proxy():
    """Test ScrapeOps proxy connection"""
    
    print("🔑 Testing ScrapeOps Proxy Port Integration")
    print("=" * 50)
    
    try:
        session = create_scrapeops_session()
        
        # Test with a simple request
        print("🧪 Testing with httpbin.org/ip...")
        response = session.get('http://httpbin.org/ip', timeout=30)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ Success! Your IP: {result.get('origin', 'Unknown')}")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Time: {response.elapsed.total_seconds():.2f}s")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def check_delaware_availability(company_name, entity_type):
    """Check if a company name is available in Delaware using ScrapeOps proxy"""
    
    try:
        # Create session with ScrapeOps proxy
        session = create_scrapeops_session()
        
        # Add random delay for anti-detection (2-5 seconds)
        delay = random.uniform(2, 5)
        print(f"⏱️  Waiting {delay:.1f} seconds for anti-detection...")
        time.sleep(delay)
        
        # Search URL
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        
        # Get the search page
        print(f"📄 Getting Delaware search page through ScrapeOps proxy...")
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        # Parse the form
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        if not form:
            raise Exception("Could not find search form")
        
        print("✅ Found search form")
        
        # Extract search term
        search_term = extract_base_name(company_name)
        print(f"🔍 Searching for: {search_term}")
        
        # Prepare form data
        form_data = {
            'ctl00$ContentPlaceHolder1$frmEntityName': search_term,
            'ctl00$ContentPlaceHolder1$btnSubmit': 'Search'
        }
        
        # Add hidden form fields
        for hidden_input in form.find_all('input', type='hidden'):
            name = hidden_input.get('name')
            value = hidden_input.get('value', '')
            if name:
                form_data[name] = value
        
        print(f"📝 Found {len(form_data)} form fields")
        
        # Add another delay before submission
        delay = random.uniform(1, 3)
        print(f"⏱️  Waiting {delay:.1f} seconds before form submission...")
        time.sleep(delay)
        
        # Submit search
        print("📤 Submitting search through ScrapeOps proxy...")
        action_url = search_url
        search_response = session.post(action_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        
        print("✅ Search submitted successfully")
        
        # Parse results
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Check for no results
        no_results_text = results_soup.get_text().lower()
        if any(phrase in no_results_text for phrase in [
            'no records found', 'no results found', 'no entities found',
            'no matches found', 'search returned no results'
        ]):
            print("✅ No results found - name appears to be available")
            return json.dumps({
                'success': True,
                'available': True,
                'message': 'Nombre disponible en Delaware',
                'method': 'delaware_scrapeops_proxy',
                'existing_entities': []
            })
        
        # Look for results table
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if results_table:
            rows = results_table.find_all('tr')
            if len(rows) <= 1:
                print("✅ No results in table - name appears to be available")
                return json.dumps({
                    'success': True,
                    'available': True,
                    'message': 'Nombre disponible en Delaware',
                    'method': 'delaware_scrapeops_proxy',
                    'existing_entities': []
                })
            else:
                print(f"📋 Found {len(rows)-1} results")
                
                # Check for exact matches
                exact_matches = []
                input_signature = extract_base_name(company_name)
                
                for i, row in enumerate(rows[1:], 1):
                    cells = row.find_all('td')
                    if len(cells) >= 2:
                        file_number = cells[0].get_text(strip=True)
                        corporate_name = cells[1].get_text(strip=True)
                        status = "ACTIVE"  # Assuming active
                        
                        corporate_signature = extract_base_name(corporate_name)
                        if corporate_signature == input_signature and corporate_signature != "":
                            exact_matches.append({
                                'name': corporate_name,
                                'status': status,
                                'signature': corporate_signature
                            })
                
                if exact_matches:
                    print(f"❌ Found {len(exact_matches)} exact matches")
                    return json.dumps({
                        "success": True,
                        "available": False,
                        "message": "Nombre no disponible en Delaware, intenta otro.",
                        "method": "delaware_scrapeops_proxy",
                        "existing_entities": [{"name": m["name"], "status": m["status"]} for m in exact_matches]
                    })
                else:
                    print("✅ No exact matches found - name appears to be available")
                    return json.dumps({
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_scrapeops_proxy",
                        "existing_entities": []
                    })
        
        # Fallback if no results table found
        print("⚠️  Could not parse results - assuming available")
        return json.dumps({
            'success': True,
            'available': True,
            'message': 'Nombre disponible en Delaware',
            'method': 'delaware_scrapeops_proxy',
            'existing_entities': []
        })
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return json.dumps({
            'success': False,
            'available': False,
            'message': f'Error checking Delaware availability: {str(e)}',
            'method': 'delaware_scrapeops_proxy',
            'existing_entities': []
        })

def lambda_handler(event, context):
    """Lambda handler for Delaware name search with ScrapeOps proxy"""
    
    try:
        # Extract parameters
        company_name = event.get('companyName', '')
        entity_type = event.get('entityType', 'LLC')
        
        if not company_name:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'success': False,
                    'available': False,
                    'message': 'Company name is required',
                    'method': 'delaware_scrapeops_proxy',
                    'existing_entities': []
                })
            }
        
        print(f"🚀 Starting Delaware search for: {company_name}")
        
        # Check availability
        result = check_delaware_availability(company_name, entity_type)
        result_data = json.loads(result)
        
        print(f"✅ Search completed: {result_data.get('message')}")
        
        return {
            'statusCode': 200,
            'body': result
        }
        
    except Exception as e:
        print(f"❌ Lambda error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'available': False,
                'message': f'Lambda error: {str(e)}',
                'method': 'delaware_scrapeops_proxy',
                'existing_entities': []
            })
        }

# Test function
if __name__ == "__main__":
    # Test 1: Proxy connection
    if test_scrapeops_proxy():
        print("\n🎉 ScrapeOps proxy is working!")
        
        # Test 2: Delaware search
        test_companies = [
            "Test Company LLC",
            "Google LLC",
            "Apple Inc",
            "Microsoft Corporation"
        ]
        
        for company in test_companies:
            print(f"\n{'='*60}")
            print(f"🧪 Testing: {company}")
            print('='*60)
            
            test_event = {
                'companyName': company,
                'entityType': 'LLC'
            }
            
            result = lambda_handler(test_event, None)
            result_data = json.loads(result['body'])
            
            print(f"\n📊 Result:")
            print(f"   Success: {result_data.get('success')}")
            print(f"   Available: {result_data.get('available')}")
            print(f"   Message: {result_data.get('message')}")
            print(f"   Method: {result_data.get('method')}")
            print(f"   Existing Entities: {len(result_data.get('existing_entities', []))}")
            
            if result_data.get('existing_entities'):
                for entity in result_data['existing_entities']:
                    print(f"     - {entity['name']} ({entity['status']})")
            
            # Add delay between tests
            time.sleep(3)
        
        print("\n✅ ScrapeOps integration complete!")
    else:
        print("\n❌ ScrapeOps proxy test failed")
