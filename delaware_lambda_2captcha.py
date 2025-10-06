#!/usr/bin/env python3
"""
Delaware Lambda with 2captcha Integration
This version uses 2captcha to solve CAPTCHA challenges from Delaware's website.
"""

import json
import requests
import time
import random
import base64
from bs4 import BeautifulSoup

# ScrapeOps configuration
SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
SCRAPEOPS_PROXY = f"http://scrapeops.headless_browser_mode=true:{SCRAPEOPS_API_KEY}@proxy.scrapeops.io:5353"

# 2captcha configuration
CAPTCHA_API_KEY = "f70e8ca44204cc56c23f32925064ee93"
CAPTCHA_SOLVE_URL = "http://2captcha.com/in.php"
CAPTCHA_RESULT_URL = "http://2captcha.com/res.php"

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

def solve_captcha(captcha_image_url, session):
    """Solve CAPTCHA using 2captcha service"""
    
    print("🧩 Solving CAPTCHA with 2captcha...")
    
    try:
        # Download CAPTCHA image
        captcha_response = session.get(captcha_image_url, timeout=30)
        captcha_image = captcha_response.content
        
        # Encode image to base64
        captcha_base64 = base64.b64encode(captcha_image).decode('utf-8')
        
        # Submit CAPTCHA to 2captcha
        solve_data = {
            'key': CAPTCHA_API_KEY,
            'method': 'base64',
            'body': captcha_base64
        }
        
        print("   📤 Submitting CAPTCHA to 2captcha...")
        solve_response = requests.post(CAPTCHA_SOLVE_URL, data=solve_data, timeout=30)
        solve_response.raise_for_status()
        
        if solve_response.text.startswith('OK|'):
            captcha_id = solve_response.text.split('|')[1]
            print(f"   ✅ CAPTCHA submitted, ID: {captcha_id}")
        else:
            print(f"   ❌ CAPTCHA submission failed: {solve_response.text}")
            return None
        
        # Wait for solution
        print("   ⏳ Waiting for CAPTCHA solution...")
        for attempt in range(30):  # Wait up to 5 minutes
            time.sleep(10)
            
            result_data = {
                'key': CAPTCHA_API_KEY,
                'action': 'get',
                'id': captcha_id
            }
            
            result_response = requests.get(CAPTCHA_RESULT_URL, params=result_data, timeout=30)
            result_response.raise_for_status()
            
            if result_response.text == 'CAPCHA_NOT_READY':
                print(f"   ⏳ Still processing... (attempt {attempt + 1}/30)")
                continue
            elif result_response.text.startswith('OK|'):
                captcha_solution = result_response.text.split('|')[1]
                print(f"   ✅ CAPTCHA solved: {captcha_solution}")
                return captcha_solution
            else:
                print(f"   ❌ CAPTCHA solving failed: {result_response.text}")
                return None
        
        print("   ❌ CAPTCHA solving timeout")
        return None
        
    except Exception as e:
        print(f"   ❌ CAPTCHA solving error: {e}")
        return None

def create_session_with_captcha_solving():
    """Create a session with CAPTCHA solving capabilities"""
    
    session = requests.Session()
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
    
    # Disable SSL verification
    session.verify = False
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    return session

def check_delaware_availability_with_captcha(company_name, entity_type):
    """Check if a company name is available in Delaware with CAPTCHA solving"""
    
    try:
        # Create session
        session = create_session_with_captcha_solving()
        
        # Add random delay for anti-detection
        delay = random.uniform(3, 7)
        print(f"⏱️  Waiting {delay:.1f} seconds for anti-detection...")
        time.sleep(delay)
        
        # Search URL
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        
        # Get the search page
        print(f"📄 Getting Delaware search page...")
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        # Parse the form
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        if not form:
            raise Exception("Could not find search form")
        
        print("✅ Found search form")
        
        # Check for CAPTCHA
        captcha_div = soup.find('div', {'id': 'ctl00_ContentPlaceHolder1_captchaDiv'})
        if captcha_div:
            print("🧩 CAPTCHA detected, solving...")
            
            # Find CAPTCHA image
            captcha_img = soup.find('img', {'id': 'ctl00_ContentPlaceHolder1_imgCaptcha'})
            if captcha_img:
                captcha_src = captcha_img.get('src')
                if captcha_src.startswith('/'):
                    captcha_url = f"http://icis.corp.delaware.gov{captcha_src}"
                else:
                    captcha_url = captcha_src
                
                # Solve CAPTCHA
                captcha_solution = solve_captcha(captcha_url, session)
                if not captcha_solution:
                    raise Exception("Failed to solve CAPTCHA")
            else:
                raise Exception("CAPTCHA image not found")
        else:
            print("✅ No CAPTCHA required")
            captcha_solution = None
        
        # Extract search term
        search_term = extract_base_name(company_name)
        print(f"🔍 Searching for: {search_term}")
        
        # Prepare form data
        form_data = {}
        for hidden_input in form.find_all('input', type='hidden'):
            name = hidden_input.get('name')
            value = hidden_input.get('value', '')
            if name:
                form_data[name] = value
        
        # Add search data
        form_data['ctl00$ContentPlaceHolder1$frmEntityName'] = search_term
        form_data['ctl00$ContentPlaceHolder1$btnSubmit'] = 'Search'
        
        # Add CAPTCHA solution if available
        if captcha_solution:
            form_data['ctl00$ContentPlaceHolder1$txtCaptcha'] = captcha_solution
        
        print(f"📝 Found {len(form_data)} form fields")
        
        # Add delay before submission
        delay = random.uniform(2, 4)
        print(f"⏱️  Waiting {delay:.1f} seconds before form submission...")
        time.sleep(delay)
        
        # Submit search
        print("📤 Submitting search...")
        search_response = session.post(search_url, data=form_data, timeout=30)
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
                'method': 'delaware_2captcha',
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
                    'method': 'delaware_2captcha',
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
                        "method": "delaware_2captcha",
                        "existing_entities": [{"name": m["name"], "status": m["status"]} for m in exact_matches]
                    })
                else:
                    print("✅ No exact matches found - name appears to be available")
                    return json.dumps({
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_2captcha",
                        "existing_entities": []
                    })
        
        # Fallback if no results table found
        print("⚠️  Could not parse results - assuming available")
        return json.dumps({
            'success': True,
            'available': True,
            'message': 'Nombre disponible en Delaware',
            'method': 'delaware_2captcha',
            'existing_entities': []
        })
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return json.dumps({
            'success': False,
            'available': False,
            'message': f'Error checking Delaware availability: {str(e)}',
            'method': 'delaware_2captcha',
            'existing_entities': []
        })

def lambda_handler(event, context):
    """Lambda handler for Delaware name search with 2captcha"""
    
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
                    'method': 'delaware_2captcha',
                    'existing_entities': []
                })
            }
        
        print(f"🚀 Starting Delaware search for: {company_name}")
        
        # Check availability
        result = check_delaware_availability_with_captcha(company_name, entity_type)
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
                'method': 'delaware_2captcha',
                'existing_entities': []
            })
        }

# Test function
if __name__ == "__main__":
    # Test the function
    test_event = {
        'companyName': 'Google LLC',
        'entityType': 'LLC'
    }
    
    print("🧪 Testing Delaware search with 2captcha...")
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))
