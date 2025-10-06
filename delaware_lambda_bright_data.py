#!/usr/bin/env python3
"""
Delaware Lambda with Bright Data Proxy Integration
This version uses your Bright Data proxy credentials for enhanced anti-ban protection.
"""

import json
import requests
import time
import random
import ssl
from bs4 import BeautifulSoup
from delaware_proxy_config import PROXY_SERVICES, build_proxy_url, get_random_proxy

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

def create_bright_data_session():
    """Create a session with Bright Data proxy"""
    
    # Get proxy configuration
    proxy_config = get_random_proxy()
    if not proxy_config:
        raise Exception("No proxy configuration available")
    
    proxy_url = build_proxy_url(proxy_config)
    if not proxy_url:
        raise Exception("Failed to build proxy URL")
    
    # Create session with proxy
    session = requests.Session()
    session.proxies = {
        'http': proxy_url,
        'https': proxy_url
    }
    
    # Set realistic headers
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    })
    
    # Disable SSL verification for proxy compatibility
    session.verify = False
    
    # Disable SSL warnings
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    return session

def check_delaware_availability(company_name, entity_type):
    """Check if a company name is available in Delaware using Bright Data proxy"""
    
    try:
        # Create session with Bright Data proxy
        session = create_bright_data_session()
        
        # Add random delay for anti-detection
        time.sleep(random.uniform(2, 5))
        
        # Search URL (using HTTP instead of HTTPS for proxy compatibility)
        search_url = 'http://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        
        # Get the search page
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
        # Parse the form
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        if not form:
            raise Exception("Could not find search form")
        
        # Extract search term
        search_term = extract_base_name(company_name)
        
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
        
        # Submit search
        action_url = search_url
        search_response = session.post(action_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        
        # Parse results
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Check for no results
        no_results_text = results_soup.get_text().lower()
        if any(phrase in no_results_text for phrase in [
            'no records found', 'no results found', 'no entities found',
            'no matches found', 'search returned no results'
        ]):
            return json.dumps({
                'success': True,
                'available': True,
                'message': 'Nombre disponible en Delaware',
                'method': 'delaware_bright_data',
                'existing_entities': []
            })
        
        # Look for results table
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if results_table:
            rows = results_table.find_all('tr')
            if len(rows) <= 1:
                return json.dumps({
                    'success': True,
                    'available': True,
                    'message': 'Nombre disponible en Delaware',
                    'method': 'delaware_bright_data',
                    'existing_entities': []
                })
            else:
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
                    return json.dumps({
                        "success": True,
                        "available": False,
                        "message": "Nombre no disponible en Delaware, intenta otro.",
                        "method": "delaware_bright_data",
                        "existing_entities": [{"name": m["name"], "status": m["status"]} for m in exact_matches]
                    })
                else:
                    return json.dumps({
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_bright_data",
                        "existing_entities": []
                    })
        
        # Fallback if no results table found
        return json.dumps({
            'success': True,
            'available': True,
            'message': 'Nombre disponible en Delaware',
            'method': 'delaware_bright_data',
            'existing_entities': []
        })
        
    except Exception as e:
        return json.dumps({
            'success': False,
            'available': False,
            'message': f'Error checking Delaware availability: {str(e)}',
            'method': 'delaware_bright_data',
            'existing_entities': []
        })

def lambda_handler(event, context):
    """Lambda handler for Delaware name search with Bright Data proxy"""
    
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
                    'method': 'delaware_bright_data',
                    'existing_entities': []
                })
            }
        
        # Check availability
        result = check_delaware_availability(company_name, entity_type)
        result_data = json.loads(result)
        
        return {
            'statusCode': 200,
            'body': result
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'available': False,
                'message': f'Lambda error: {str(e)}',
                'method': 'delaware_bright_data',
                'existing_entities': []
            })
        }

# Test function
if __name__ == "__main__":
    # Test the function
    test_event = {
        'companyName': 'Test Company LLC',
        'entityType': 'LLC'
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))
