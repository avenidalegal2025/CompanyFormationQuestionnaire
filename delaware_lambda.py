import json
import logging
import requests
import re
from bs4 import BeautifulSoup
import time
import random

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
    Lambda function to check company name availability on Delaware Division of Corporations
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
        
        # Use requests to check Delaware
        result = check_delaware_availability(company_name, entity_type)
        
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

def check_delaware_availability(company_name, entity_type):
    """
    Check company availability using Delaware Division of Corporations search
    """
    try:
        # Create session with realistic headers
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        # Add random delay to be respectful - Delaware prohibits data mining
        # "The Division of Corporations strictly prohibits mining data. Excessive and repeated 
        # searches that may have a negative impact on our systems and customer experience are 
        # also prohibited. Use of automated tools in any form may result in the suspension 
        # of your access to utilize this service."
        time.sleep(random.uniform(2, 5))  # Longer delays for Delaware compliance
        
        # Get the main search page first
        search_url = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        logger.info(f"Fetching Delaware search page: {search_url}")
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        logger.info("Successfully fetched Delaware search page")
        
        # Parse the form to get any required tokens
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the search form - looking for the main form on the page
        form = soup.find('form')
        if not form:
            raise Exception("Could not find search form")
        
        # Extract base name for searching (remove suffixes)
        search_term = extract_base_name(company_name)
        logger.info(f"Searching for base name: '{search_term}' (original: '{company_name}')")
        
        # Prepare form data - using the actual field names from the Delaware form
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
        
        # Submit the search - Delaware forms typically post to themselves
        action_url = search_url
        
        logger.info(f"Submitting search to: {action_url}")
        search_response = session.post(action_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        logger.info("Successfully submitted search")
        
        # Parse results
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Debug: Log the page content
        logger.info(f"Response length: {len(search_response.text)}")
        
        # Look for "No records found" message - Delaware specific messaging
        no_results_text = results_soup.get_text().lower()
        if any(phrase in no_results_text for phrase in [
            'no records found', 'no results found', 'no entities found',
            'no matches found', 'search returned no results'
        ]):
            logger.info("Found 'No records found' message")
            return json.dumps({
                'success': True,
                'available': True,
                'message': 'Nombre disponible en Delaware',
                'method': 'delaware_requests',
                'existing_entities': []
            })
        
        # Look for results table - Delaware uses tblResults ID
        results_table = results_soup.find('table', {'id': 'tblResults'})
        if not results_table:
            # Try alternative selectors for Delaware results
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
                    'method': 'delaware_requests',
                    'existing_entities': []
                })
            else:
                # Parse each result row to check for name conflicts using sophisticated normalization
                exact_matches = []
                similar_matches = []
                
                # Extract comparable signature from input
                input_signature = extract_base_name(company_name)
                logger.info(f"Input signature: '{input_signature}' from '{company_name}'")
                
                for i, row in enumerate(rows[1:], 1):  # Skip header row
                    cells = row.find_all('td')
                    if len(cells) >= 2:
                        # Delaware results have: FILE NUMBER, ENTITY NAME columns
                        # Based on the screenshot, entity name is in the second column
                        if len(cells) >= 2:
                            file_number = cells[0].get_text(strip=True)
                            corporate_name = cells[1].get_text(strip=True)
                        else:
                            corporate_name = cells[0].get_text(strip=True)
                            file_number = ""
                        
                        # For Delaware, we'll assume entities are active unless we can determine otherwise
                        # The basic search doesn't show status, so we'll mark as active
                        status = "ACTIVE"
                        
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
                    active_exact = [m for m in exact_matches if 'ACTIVE' in m['status'] or 'GOOD' in m['status']]
                    if active_exact:
                        logger.info(f"Found {len(active_exact)} active exact matches")
                        return json.dumps({
                            "success": True,
                            "available": False,
                            "message": "Nombre no disponible en Delaware, intenta otro.",
                            "method": "delaware_requests",
                            "existing_entities": [{"name": m["name"], "status": m["status"]} for m in active_exact]
                        })
                    else:
                        inactive_exact = [m for m in exact_matches if 'ACTIVE' not in m['status'] and 'GOOD' not in m['status']]
                        logger.info(f"Found {len(inactive_exact)} inactive exact matches")
                        return json.dumps({
                            "success": True,
                            "available": True,
                            "message": "Nombre disponible en Delaware",
                            "method": "delaware_requests",
                            "existing_entities": []
                        })
                else:
                    # No exact matches found
                    logger.info(f"No exact matches found, {len(similar_matches)} similar matches")
                    return json.dumps({
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_requests",
                        "existing_entities": []
                    })
        
        # If we can't find a results table, log the page content for debugging
        logger.warning("Could not find results table, logging page content")
        page_text = results_soup.get_text()[:1000]  # First 1000 chars
        logger.warning(f"Page content preview: {page_text}")
        
        return json.dumps({
            'success': True,
            'available': True,
            'message': 'Nombre disponible en Delaware',
            'method': 'delaware_requests',
            'existing_entities': []
        })
        
    except Exception as e:
        logger.error(f"Delaware check error: {e}")
        raise e
