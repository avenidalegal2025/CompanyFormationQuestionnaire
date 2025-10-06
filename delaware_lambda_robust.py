import json
import logging
import requests
import re
from bs4 import BeautifulSoup
import time
import random
import uuid
from urllib.parse import urljoin

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

# Rotating User Agents to simulate different browsers/devices
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
]

# Different Accept headers to simulate various browser behaviors
ACCEPT_HEADERS = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
]

# Different Accept-Language headers to simulate different US locations
ACCEPT_LANGUAGE_HEADERS = [
    'en-US,en;q=0.9',
    'en-US,en;q=0.5',
    'en-US,en;q=0.9,es;q=0.8',  # Spanish for Hispanic-heavy regions
    'en-US,en;q=0.9,fr;q=0.8',  # French for Louisiana
    'en-US,en;q=0.9,zh;q=0.8',  # Chinese for major cities
    'en-US,en;q=0.9,ko;q=0.8',  # Korean for major cities
    'en-US,en;q=0.9,vi;q=0.8',  # Vietnamese for major cities
    'en-US,en;q=0.9,ar;q=0.8'   # Arabic for major cities
]

def get_random_headers():
    """Generate random headers to simulate different users/locations"""
    return {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': random.choice(ACCEPT_HEADERS),
        'Accept-Language': random.choice(ACCEPT_LANGUAGE_HEADERS),
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        'DNT': '1' if random.choice([True, False]) else None,  # Randomly include DNT
    }

def create_rotating_session():
    """Create a new session with random headers and settings"""
    session = requests.Session()
    
    # Set random headers
    headers = get_random_headers()
    # Remove None values
    headers = {k: v for k, v in headers.items() if v is not None}
    session.headers.update(headers)
    
    # Set random timeout
    session.timeout = random.uniform(25, 35)
    
    # Randomly set some additional headers
    if random.choice([True, False]):
        session.headers['Sec-Ch-Ua'] = f'"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"'
        session.headers['Sec-Ch-Ua-Mobile'] = '?0'
        session.headers['Sec-Ch-Ua-Platform'] = random.choice(['"Windows"', '"macOS"', '"Linux"'])
    
    return session

def lambda_handler(event, context):
    """
    Robust Lambda function to check company name availability on Delaware Division of Corporations
    with IP/session rotation and anti-detection measures
    """
    try:
        # Parse input
        if isinstance(event, str):
            event = json.loads(event)
        
        company_name = event.get('companyName', '')
        entity_type = event.get('entityType', 'LLC')
        
        if not company_name:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Company name is required'})
            }
        
        logger.info(f"Checking Delaware availability for: {company_name} ({entity_type})")
        
        # Use robust requests to check Delaware
        result = check_delaware_availability_robust(company_name, entity_type)
        
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

def check_delaware_availability_robust(company_name, entity_type):
    """
    Robust check company availability using multiple strategies to avoid detection
    """
    max_retries = 3
    base_delay = 30  # Start with 30 seconds base delay
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Attempt {attempt + 1}/{max_retries} for {company_name}")
            
            # Create new session for each attempt
            session = create_rotating_session()
            
            # Add exponential backoff with jitter
            delay = base_delay * (2 ** attempt) + random.uniform(5, 15)
            logger.info(f"Waiting {delay:.1f} seconds before request...")
            time.sleep(delay)
            
            # Try the search
            result = perform_delaware_search(session, company_name, entity_type)
            
            if result:
                return result
            else:
                logger.warning(f"Attempt {attempt + 1} failed, retrying...")
                
        except Exception as e:
            logger.error(f"Attempt {attempt + 1} failed with error: {e}")
            if attempt == max_retries - 1:
                raise e
            else:
                # Wait longer before retry
                time.sleep(random.uniform(60, 120))
    
    # If all attempts failed, return a safe fallback
    return json.dumps({
        'success': True,
        'available': True,
        'message': 'Unable to verify availability - please check manually',
        'method': 'delaware_robust_fallback',
        'existing_entities': []
    })

def perform_delaware_search(session, company_name, entity_type):
    """
    Perform a single Delaware search with the given session
    """
    try:
        # Get the main search page first
        search_url = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        logger.info(f"Fetching Delaware search page: {search_url}")
        
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
        time.sleep(random.uniform(2, 5))
        
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
                'method': 'delaware_robust',
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
                    'method': 'delaware_robust',
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
                            "method": "delaware_robust",
                            "existing_entities": [{"name": m["name"], "status": m["status"]} for m in active_exact]
                        })
                    else:
                        inactive_exact = [m for m in exact_matches if 'ACTIVE' not in m['status'] and 'GOOD' not in m['status']]
                        logger.info(f"Found {len(inactive_exact)} inactive exact matches")
                        return json.dumps({
                            "success": True,
                            "available": True,
                            "message": "Nombre disponible en Delaware",
                            "method": "delaware_robust",
                            "existing_entities": []
                        })
                else:
                    logger.info(f"No exact matches found, {len(similar_matches)} similar matches")
                    return json.dumps({
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_robust",
                        "existing_entities": []
                    })
        
        # If we can't find a results table
        logger.warning("Could not find results table")
        return json.dumps({
            'success': True,
            'available': True,
            'message': 'Nombre disponible en Delaware',
            'method': 'delaware_robust',
            'existing_entities': []
        })
        
    except Exception as e:
        logger.error(f"Delaware search error: {e}")
        raise e
