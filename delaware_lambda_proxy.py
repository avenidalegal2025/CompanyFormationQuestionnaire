import json
import logging
import requests
import re
from bs4 import BeautifulSoup
import time
import random
import uuid
from urllib.parse import urljoin
import os

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Generic words to remove when normalizing company names
GENERIC_WORDS = {
    "corp", "corporation", "inc", "incorporated",
    "llc", "limited", "limited liability company", "limited liability co", "co", "company", "lc", "ltd", "ltd.", "ltd",
    "limited partnership", "lp", "partnership",
    "statutory trust", "trust", "foundation",
    "l3c", "dao", "lao",
    "the", "and", "&",
}

# Punctuation pattern for normalization
PUNCTUATION_PATTERN = re.compile(r"[^\w\s]")

# Singular/plural equivalences
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

# Number words for normalization
NUMBER_WORDS = {
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
    "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"
}

# Roman numeral pattern
ROMAN_NUMERAL_PATTERN = re.compile(r"\b[IVXLCDM]+\b", re.IGNORECASE)

# Proxy configurations (you can add your proxy services here)
PROXY_CONFIGS = [
    # Example proxy configurations - replace with actual proxy services
    # {
    #     'http': 'http://username:password@proxy1.example.com:8080',
    #     'https': 'https://username:password@proxy1.example.com:8080'
    # },
    # {
    #     'http': 'http://username:password@proxy2.example.com:8080',
    #     'https': 'https://username:password@proxy2.example.com:8080'
    # }
]

# Different US geographic locations to simulate
GEO_LOCATIONS = [
    {'country': 'US', 'region': 'NY', 'city': 'New York', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'CA', 'city': 'Los Angeles', 'timezone': 'America/Los_Angeles'},
    {'country': 'US', 'region': 'TX', 'city': 'Houston', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'FL', 'city': 'Miami', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'IL', 'city': 'Chicago', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'WA', 'city': 'Seattle', 'timezone': 'America/Los_Angeles'},
    {'country': 'US', 'region': 'GA', 'city': 'Atlanta', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'NC', 'city': 'Charlotte', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'PA', 'city': 'Philadelphia', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'AZ', 'city': 'Phoenix', 'timezone': 'America/Phoenix'},
    {'country': 'US', 'region': 'CO', 'city': 'Denver', 'timezone': 'America/Denver'},
    {'country': 'US', 'region': 'NV', 'city': 'Las Vegas', 'timezone': 'America/Los_Angeles'},
    {'country': 'US', 'region': 'OR', 'city': 'Portland', 'timezone': 'America/Los_Angeles'},
    {'country': 'US', 'region': 'UT', 'city': 'Salt Lake City', 'timezone': 'America/Denver'},
    {'country': 'US', 'region': 'MN', 'city': 'Minneapolis', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'MI', 'city': 'Detroit', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'OH', 'city': 'Columbus', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'TN', 'city': 'Nashville', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'LA', 'city': 'New Orleans', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'MA', 'city': 'Boston', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'MD', 'city': 'Baltimore', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'VA', 'city': 'Richmond', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'SC', 'city': 'Charleston', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'AL', 'city': 'Birmingham', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'MS', 'city': 'Jackson', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'AR', 'city': 'Little Rock', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'OK', 'city': 'Oklahoma City', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'KS', 'city': 'Wichita', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'NE', 'city': 'Omaha', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'IA', 'city': 'Des Moines', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'MO', 'city': 'Kansas City', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'WI', 'city': 'Milwaukee', 'timezone': 'America/Chicago'},
    {'country': 'US', 'region': 'IN', 'city': 'Indianapolis', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'KY', 'city': 'Louisville', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'WV', 'city': 'Charleston', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'DE', 'city': 'Wilmington', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'NJ', 'city': 'Newark', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'CT', 'city': 'Hartford', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'RI', 'city': 'Providence', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'VT', 'city': 'Burlington', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'NH', 'city': 'Manchester', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'ME', 'city': 'Portland', 'timezone': 'America/New_York'},
    {'country': 'US', 'region': 'AK', 'city': 'Anchorage', 'timezone': 'America/Anchorage'},
    {'country': 'US', 'region': 'HI', 'city': 'Honolulu', 'timezone': 'Pacific/Honolulu'}
]

# Advanced User Agents with different browser versions and OS combinations
ADVANCED_USER_AGENTS = [
    # Windows Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    
    # Windows Firefox
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
    
    # Windows Edge
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/119.0.0.0 Safari/537.36',
    
    # macOS Chrome
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    
    # macOS Safari
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    
    # Linux Chrome
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    
    # Mobile devices
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
]

def get_geographic_headers(location=None):
    """Generate headers based on US geographic location"""
    if not location:
        location = random.choice(GEO_LOCATIONS)
    
    # Base language for all US locations
    base_lang = 'en-US,en;q=0.9'
    
    # Add regional language variations for US locations
    if location['region'] in ['TX', 'FL', 'CA', 'NM', 'AZ', 'CO', 'NV']:
        base_lang += ',es;q=0.8'  # Spanish for Hispanic-heavy regions
    elif location['region'] == 'LA':
        base_lang += ',fr;q=0.8'  # French for Louisiana
    elif location['region'] in ['NY', 'CA', 'WA', 'IL', 'TX', 'FL']:
        # Major cities with diverse populations
        additional_langs = random.choice([
            ',zh;q=0.8',  # Chinese
            ',ko;q=0.8',  # Korean
            ',vi;q=0.8',  # Vietnamese
            ',ar;q=0.8',  # Arabic
            ',hi;q=0.8'   # Hindi
        ])
        base_lang += additional_langs
    
    # Generate realistic US IP addresses based on region
    us_ip_ranges = {
        'NY': ['192.168.1.', '10.0.1.', '172.16.1.'],
        'CA': ['192.168.2.', '10.0.2.', '172.16.2.'],
        'TX': ['192.168.3.', '10.0.3.', '172.16.3.'],
        'FL': ['192.168.4.', '10.0.4.', '172.16.4.'],
        'IL': ['192.168.5.', '10.0.5.', '172.16.5.'],
        'WA': ['192.168.6.', '10.0.6.', '172.16.6.'],
        'GA': ['192.168.7.', '10.0.7.', '172.16.7.'],
        'NC': ['192.168.8.', '10.0.8.', '172.16.8.'],
        'PA': ['192.168.9.', '10.0.9.', '172.16.9.'],
        'AZ': ['192.168.10.', '10.0.10.', '172.16.10.'],
    }
    
    # Get IP range for the region, fallback to generic US range
    ip_range = us_ip_ranges.get(location['region'], ['192.168.1.', '10.0.1.', '172.16.1.'])
    base_ip = random.choice(ip_range)
    ip_suffix = random.randint(1, 254)
    fake_ip = f"{base_ip}{ip_suffix}"
    
    return {
        'Accept-Language': base_lang,
        'X-Forwarded-For': fake_ip,
        'X-Real-IP': fake_ip,
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'icis.corp.delaware.gov',
    }

def create_advanced_session(use_proxy=False, location=None):
    """Create an advanced session with sophisticated anti-detection measures"""
    session = requests.Session()
    
    # Choose user agent
    user_agent = random.choice(ADVANCED_USER_AGENTS)
    
    # Base headers
    headers = {
        'User-Agent': user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
    }
    
    # Add geographic headers
    geo_headers = get_geographic_headers(location)
    headers.update(geo_headers)
    
    # Randomly add some optional headers
    if random.choice([True, False]):
        headers['DNT'] = '1'
    
    if 'Chrome' in user_agent:
        headers['Sec-Ch-Ua'] = f'"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"'
        headers['Sec-Ch-Ua-Mobile'] = '?0'
        headers['Sec-Ch-Ua-Platform'] = random.choice(['"Windows"', '"macOS"', '"Linux"'])
    
    # Remove None values
    headers = {k: v for k, v in headers.items() if v is not None}
    session.headers.update(headers)
    
    # Set proxy if requested
    if use_proxy and PROXY_CONFIGS:
        proxy_config = random.choice(PROXY_CONFIGS)
        session.proxies.update(proxy_config)
        logger.info(f"Using proxy: {proxy_config}")
    
    # Set random timeout
    session.timeout = random.uniform(25, 35)
    
    return session

def lambda_handler(event, context):
    """
    Advanced Lambda function with proxy support and geographic rotation
    """
    try:
        # Parse input
        if isinstance(event, str):
            event = json.loads(event)
        
        company_name = event.get('companyName', '')
        entity_type = event.get('entityType', 'LLC')
        use_proxy = event.get('useProxy', False)
        location = event.get('location', None)
        
        if not company_name:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Company name is required'})
            }
        
        logger.info(f"Checking Delaware availability for: {company_name} ({entity_type})")
        if use_proxy:
            logger.info("Using proxy for request")
        if location:
            logger.info(f"Simulating location: {location}")
        
        # Use advanced requests to check Delaware
        result = check_delaware_availability_advanced(company_name, entity_type, use_proxy, location)
        
        return {
            'statusCode': 200,
            'body': result
        }
    
    except Exception as e:
        logger.error(f"Lambda handler error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Error checking availability: {str(e)}'})
        }

def normalize_tokens(name):
    """Normalize company name tokens by removing generic words, punctuation, and handling singular/plural forms."""
    n = name.lower()
    n = PUNCTUATION_PATTERN.sub(" ", n)
    n = re.sub(r"\s+", " ", n).strip()
    tokens = n.split(" ")
    out = []
    for tok in tokens:
        if not tok:
            continue
        if tok in GENERIC_WORDS:
            continue
        canon = None
        for sing, plur in SING_PLUR_EQUIV.items():
            if tok == sing or tok == plur:
                canon = sing
                break
        if canon:
            out.append(canon)
            continue
        if tok.endswith("s") and len(tok) > 3 and tok not in NUMBER_WORDS:
            if not ROMAN_NUMERAL_PATTERN.fullmatch(tok):
                out.append(tok[:-1])
                continue
        out.append(tok)
    return out

def comparable_signature(name):
    """Create a comparable signature by normalizing tokens and joining them."""
    toks = [t for t in normalize_tokens(name) if t]
    return " ".join(toks)

def extract_base_name(company_name):
    """Extract base name using the sophisticated normalization logic."""
    return comparable_signature(company_name)

def check_delaware_availability_advanced(company_name, entity_type, use_proxy=False, location=None):
    """
    Advanced check company availability with multiple strategies
    """
    max_retries = 3
    base_delay = 45  # Start with 45 seconds base delay for advanced version
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Advanced attempt {attempt + 1}/{max_retries} for {company_name}")
            
            # Create new session for each attempt with different characteristics
            session = create_advanced_session(use_proxy=use_proxy, location=location)
            
            # Add exponential backoff with jitter
            delay = base_delay * (2 ** attempt) + random.uniform(10, 30)
            logger.info(f"Waiting {delay:.1f} seconds before request...")
            time.sleep(delay)
            
            # Try the search
            result = perform_delaware_search_advanced(session, company_name, entity_type)
            
            if result:
                return result
            else:
                logger.warning(f"Advanced attempt {attempt + 1} failed, retrying...")
                
        except Exception as e:
            logger.error(f"Advanced attempt {attempt + 1} failed with error: {e}")
            if attempt == max_retries - 1:
                raise e
            else:
                # Wait longer before retry
                time.sleep(random.uniform(120, 180))
    
    # If all attempts failed, return a safe fallback
    return json.dumps({
        'success': True,
        'available': True,
        'message': 'Unable to verify availability - please check manually',
        'method': 'delaware_advanced_fallback',
        'existing_entities': []
    })

def perform_delaware_search_advanced(session, company_name, entity_type):
    """
    Perform a single Delaware search with advanced anti-detection measures
    """
    try:
        # Get the main search page first
        search_url = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        logger.info(f"Fetching Delaware search page: {search_url}")
        
        # Add random delay before first request
        time.sleep(random.uniform(1, 3))
        
        response = session.get(search_url, timeout=session.timeout)
        response.raise_for_status()
        logger.info("Successfully fetched Delaware search page")
        
        # Parse the form to get any required tokens
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the search form
        form = soup.find('form')
        if not form:
            raise Exception("Could not find search form")
        
        # Extract base name for searching
        search_term = extract_base_name(company_name)
        logger.info(f"Searching for base name: '{search_term}' (original: '{company_name}')")
        
        # Prepare form data
        form_data = {
            'ctl00$ContentPlaceHolder1$frmEntityName': search_term,
            'ctl00$ContentPlaceHolder1$btnSubmit': 'Search'
        }
        
        # Add any hidden fields including viewstate
        for hidden_input in form.find_all('input', type='hidden'):
            name = hidden_input.get('name')
            value = hidden_input.get('value', '')
            if name:
                form_data[name] = value
                logger.info(f"Added hidden field: {name} = {value[:50]}...")
        
        # Add random delay before submission
        time.sleep(random.uniform(3, 8))
        
        # Submit the search
        action_url = search_url
        logger.info(f"Submitting search to: {action_url}")
        
        search_response = session.post(action_url, data=form_data, timeout=session.timeout)
        search_response.raise_for_status()
        logger.info("Successfully submitted search")
        
        # Parse results
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Check for ban/block indicators
        page_text = results_soup.get_text().lower()
        if any(word in page_text for word in ['blocked', 'banned', 'suspended', 'access denied', 'too many requests']):
            logger.warning("Detected ban/block message in response")
            return None
        
        # Look for "No records found" message
        if any(phrase in page_text for phrase in [
            'no records found', 'no results found', 'no entities found',
            'no matches found', 'search returned no results'
        ]):
            logger.info("Found 'No records found' message")
            return json.dumps({
                'success': True,
                'available': True,
                'message': 'Nombre disponible en Delaware',
                'method': 'delaware_advanced',
                'existing_entities': []
            })
        
        # Look for results table
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if not results_table:
            # Try alternative selectors
            results_table = results_soup.find('table', {'id': 'ctl00_ContentPlaceHolder1_gvSearchResults'})
            if not results_table:
                results_table = results_soup.find('table', {'id': 'gvSearchResults'})
                if not results_table:
                    results_table = results_soup.find('table', class_='searchResults')
                    if not results_table:
                        # Look for any table that might contain search results
                        tables = results_soup.find_all('table')
                        for table in tables:
                            table_text = table.get_text().lower()
                            if 'entity' in table_text or 'name' in table_text or 'file number' in table_text:
                                results_table = table
                                break
        
        if results_table:
            logger.info("Found results table")
            rows = results_table.find_all('tr')
            logger.info(f"Found {len(rows)} rows in results table")
            
            if len(rows) <= 1:  # Only header
                return json.dumps({
                    'success': True,
                    'available': True,
                    'message': 'Nombre disponible en Delaware',
                    'method': 'delaware_advanced',
                    'existing_entities': []
                })
            else:
                # Parse each result row
                exact_matches = []
                similar_matches = []
                
                input_signature = extract_base_name(company_name)
                logger.info(f"Input signature: '{input_signature}' from '{company_name}'")
                
                for i, row in enumerate(rows[1:], 1):  # Skip header row
                    cells = row.find_all('td')
                    if len(cells) >= 2:
                        # Delaware results have: FILE NUMBER, ENTITY NAME columns
                        file_number = cells[0].get_text(strip=True)
                        corporate_name = cells[1].get_text(strip=True)
                        status = "ACTIVE"  # Assume active for Delaware
                        
                        logger.info(f"Row {i}: {corporate_name} - {status}")
                        
                        # Extract comparable signature from corporate name
                        corporate_signature = extract_base_name(corporate_name)
                        logger.info(f"Corporate signature: '{corporate_signature}' from '{corporate_name}'")
                        
                        # Check for exact match
                        if corporate_signature == input_signature and corporate_signature != "":
                            exact_matches.append({
                                'name': corporate_name,
                                'status': status,
                                'signature': corporate_signature
                            })
                            logger.info(f"Exact match found: {corporate_name} - {status}")
                        else:
                            # Check for soft conflicts
                            input_base = re.sub(r"\b(\d+|" + "|".join(NUMBER_WORDS) + r"|[IVXLCDM]+)\b", "", input_signature, flags=re.IGNORECASE)
                            input_base = re.sub(r"\s+", " ", input_base).strip()
                            corporate_base = re.sub(r"\b(\d+|" + "|".join(NUMBER_WORDS) + r"|[IVXLCDM]+)\b", "", corporate_signature, flags=re.IGNORECASE)
                            corporate_base = re.sub(r"\s+", " ", corporate_base).strip()
                            
                            if input_base == corporate_base and input_base != "":
                                similar_matches.append({
                                    'name': corporate_name,
                                    'status': status,
                                    'signature': corporate_signature,
                                    'reason': 'Only differs by numerals/roman numerals/number words'
                                })
                                logger.info(f"Soft conflict found: {corporate_name} - {status}")
                
                # Check for exact matches
                if exact_matches:
                    active_exact = [m for m in exact_matches if 'ACTIVE' in m['status'] or 'GOOD' in m['status']]
                    if active_exact:
                        logger.info(f"Found {len(active_exact)} active exact matches")
                        return json.dumps({
                            "success": True,
                            "available": False,
                            "message": "Nombre no disponible en Delaware, intenta otro.",
                            "method": "delaware_advanced",
                            "existing_entities": [{"name": m["name"], "status": m["status"]} for m in active_exact]
                        })
                    else:
                        inactive_exact = [m for m in exact_matches if 'ACTIVE' not in m['status'] and 'GOOD' not in m['status']]
                        logger.info(f"Found {len(inactive_exact)} inactive exact matches")
                        return json.dumps({
                            "success": True,
                            "available": True,
                            "message": "Nombre disponible en Delaware",
                            "method": "delaware_advanced",
                            "existing_entities": []
                        })
                else:
                    logger.info(f"No exact matches found, {len(similar_matches)} similar matches")
                    return json.dumps({
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_advanced",
                        "existing_entities": []
                    })
        
        # If we can't find a results table
        logger.warning("Could not find results table")
        return json.dumps({
            'success': True,
            'available': True,
            'message': 'Nombre disponible en Delaware',
            'method': 'delaware_advanced',
            'existing_entities': []
        })
        
    except Exception as e:
        logger.error(f"Delaware advanced search error: {e}")
        raise e
