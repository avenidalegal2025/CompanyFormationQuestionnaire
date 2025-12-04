import json
import logging
import requests
import re
from bs4 import BeautifulSoup

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

def lambda_handler(event, context):
    """
    Simple Lambda function to check company name availability on Sunbiz
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
        
        logger.info(f"Checking availability for: {company_name} ({entity_type})")
        
        # Use requests to check Sunbiz
        result = check_sunbiz_availability(company_name, entity_type)
        
        # Result is now a string message directly
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
    """
    Normalize company name tokens by removing generic words, punctuation, and handling singular/plural forms.
    Based on the sophisticated logic from name_check.py
    """
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
    """
    Create a comparable signature by normalizing tokens and joining them.
    """
    toks = [t for t in normalize_tokens(name) if t]
    return " ".join(toks)

def extract_base_name(company_name):
    """
    Extract base name using the sophisticated normalization logic.
    This creates a comparable signature that removes generic words, punctuation,
    handles singular/plural forms, and normalizes the name for comparison.
    """
    return comparable_signature(company_name)

def check_sunbiz_availability(company_name, entity_type):
    """
    Check company availability using requests/BeautifulSoup
    """
    try:
        # Create session
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
        # Get the search page first
        search_url = 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName'
        logger.info(f"Fetching search page: {search_url}")
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        logger.info("Successfully fetched search page")
        
        # Parse the form to get any required tokens
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the search form
        form = soup.find('form')
        if not form:
            raise Exception("Could not find search form")
        
        # Extract base name for searching (remove suffixes)
        search_term = extract_base_name(company_name)
        logger.info(f"Searching for base name: '{search_term}' (original: '{company_name}')")
        
        # Prepare form data
        form_data = {
            'SearchTerm': search_term,
            'SearchType': entity_type
        }
        
        # Add any hidden fields
        for hidden_input in form.find_all('input', type='hidden'):
            name = hidden_input.get('name')
            value = hidden_input.get('value', '')
            if name:
                form_data[name] = value
                logger.info(f"Added hidden field: {name} = {value}")
        
        # Submit the search
        action_url = form.get('action', search_url)
        if not action_url.startswith('http'):
            action_url = 'https://search.sunbiz.org' + action_url
        
        logger.info(f"Submitting search to: {action_url}")
        search_response = session.post(action_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        logger.info("Successfully submitted search")
        
        # Parse results
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Debug: Log the page content
        logger.info(f"Response length: {len(search_response.text)}")
        
        # Look for "No records found" message
        no_results = results_soup.find(text=lambda text: text and 'No records were found' in text)
        if no_results:
            logger.info("Found 'No records found' message")
            return {
                'success': True,
                'available': True,
                'message': f'Company name "{company_name}" appears to be available',
                'method': 'requests'
            }
        
        # Look for results table
        results_table = results_soup.find('table', class_='searchResults')
        if not results_table:
            # Try alternative selectors
            results_table = results_soup.find('table', {'id': 'SearchResults'})
            if not results_table:
                # Try any table with "Entity" in the text
                results_table = results_soup.find('table')
                if results_table:
                    table_text = results_table.get_text()
                    if 'Entity' not in table_text and 'Corporate' not in table_text:
                        results_table = None
        
        if results_table:
            logger.info("Found results table")
            rows = results_table.find_all('tr')
            logger.info(f"Found {len(rows)} rows in results table")
            
            if len(rows) <= 1:  # Only header
                return {
                    'success': True,
                    'available': True,
                    'message': f'Company name "{company_name}" appears to be available',
                    'method': 'requests'
                }
            else:
                # Parse each result row to check for name conflicts using sophisticated normalization
                exact_matches = []
                similar_matches = []
                
                # Extract comparable signature from input
                input_signature = extract_base_name(company_name)
                logger.info(f"Input signature: '{input_signature}' from '{company_name}'")
                
                for i, row in enumerate(rows[1:], 1):  # Skip header row
                    cells = row.find_all('td')
                    if len(cells) >= 3:
                        corporate_name = cells[0].get_text(strip=True)
                        status = cells[2].get_text(strip=True).upper()
                        
                        logger.info(f"Row {i}: {corporate_name} - {status}")
                        
                        # Extract comparable signature from corporate name
                        corporate_signature = extract_base_name(corporate_name)
                        logger.info(f"Corporate signature: '{corporate_signature}' from '{corporate_name}'")
                        
                        # Check for exact match (same normalized signature)
                        if corporate_signature == input_signature and corporate_signature != "":
                            exact_matches.append({
                                'name': corporate_name,
                                'status': status,
                                'signature': corporate_signature
                            })
                            logger.info(f"Exact match found: {corporate_name} - {status}")
                        else:
                            # Check for soft conflicts (only differ by numbers/roman numerals)
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
                
                # Check for exact matches (same normalized signature)
                if exact_matches:
                    active_exact = [m for m in exact_matches if m['status'] == 'ACTIVE']
                    if active_exact:
                        logger.info(f"Found {len(active_exact)} active exact matches")
                        return "company name NOT AVAILABLE, choose another."
                    else:
                        inactive_exact = [m for m in exact_matches if m['status'] != 'ACTIVE']
                        logger.info(f"Found {len(inactive_exact)} inactive exact matches")
                        return "Company name AVAILABLE"
                else:
                    # No exact matches found
                    logger.info(f"No exact matches found, {len(similar_matches)} similar matches")
                    return "Company name AVAILABLE"
        
        # If we can't find a results table, log the page content for debugging
        logger.warning("Could not find results table, logging page content")
        page_text = results_soup.get_text()[:1000]  # First 1000 chars
        logger.warning(f"Page content preview: {page_text}")
        
        return "Company name AVAILABLE"
        
    except Exception as e:
        logger.error(f"Sunbiz check error: {e}")
        raise e
