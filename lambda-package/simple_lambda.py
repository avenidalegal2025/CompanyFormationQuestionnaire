import json
import logging
import requests
from bs4 import BeautifulSoup

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

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
        
        return {
            'statusCode': 200,
            'body': json.dumps(result)
        }
    
    except Exception as e:
        logger.error(f"Lambda handler error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Error checking availability: {str(e)}'})
        }

def extract_base_name(company_name):
    """
    Extract base name by removing common corporate suffixes
    """
    # Common suffixes to remove (case insensitive)
    suffixes = [
        ' LLC', ' L.L.C.', ' L.C.',
        ' INC', ' INCORPORATED', ' INC.',
        ' CORP', ' CORPORATION', ' CORP.',
        ' LTD', ' LIMITED', ' LTD.',
        ' CO', ' COMPANY', ' CO.',
        ' LP', ' L.P.',
        ' LLP', ' L.L.P.',
        ' PC', ' P.C.',
        ' PA', ' P.A.',
        ' PROFESSIONAL ASSOCIATION',
        ' PROFESSIONAL CORPORATION'
    ]
    
    base_name = company_name.upper().strip()
    
    # Remove suffixes (try longest first to avoid partial matches)
    suffixes.sort(key=len, reverse=True)
    
    for suffix in suffixes:
        if base_name.endswith(suffix):
            base_name = base_name[:-len(suffix)].strip()
            break
    
    return base_name

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
        
        # Prepare form data
        form_data = {
            'SearchTerm': company_name,
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
                # Parse each result row to check for name conflicts
                exact_matches = []
                name_conflicts = []
                similar_matches = []
                
                # Extract base name from input (remove common suffixes)
                base_name = extract_base_name(company_name.upper())
                logger.info(f"Base name extracted: '{base_name}' from '{company_name}'")
                
                for i, row in enumerate(rows[1:], 1):  # Skip header row
                    cells = row.find_all('td')
                    if len(cells) >= 3:
                        corporate_name = cells[0].get_text(strip=True).upper()
                        status = cells[2].get_text(strip=True).upper()
                        
                        logger.info(f"Row {i}: {corporate_name} - {status}")
                        
                        # Extract base name from corporate name
                        corporate_base = extract_base_name(corporate_name)
                        logger.info(f"Corporate base name: '{corporate_base}' from '{corporate_name}'")
                        
                        # Check for exact match (case insensitive)
                        if company_name.upper() in corporate_name or corporate_name in company_name.upper():
                            exact_matches.append({
                                'name': corporate_name,
                                'status': status,
                                'base_name': corporate_base
                            })
                            logger.info(f"Exact match found: {corporate_name} - {status}")
                        # Check for name conflict (same base name with different suffix)
                        elif corporate_base == base_name and corporate_base != "":
                            name_conflicts.append({
                                'name': corporate_name,
                                'status': status,
                                'base_name': corporate_base
                            })
                            logger.info(f"Name conflict found: {corporate_name} - {status}")
                        else:
                            similar_matches.append({
                                'name': corporate_name,
                                'status': status,
                                'base_name': corporate_base
                            })
                
                # Check for exact matches first
                if exact_matches:
                    active_exact = [m for m in exact_matches if m['status'] == 'ACTIVE']
                    if active_exact:
                        logger.info(f"Found {len(active_exact)} active exact matches")
                        return {
                            'success': True,
                            'available': False,
                            'message': f'Company name "{company_name}" is NOT available - found active entity: {active_exact[0]["name"]}',
                            'method': 'requests',
                            'conflict_type': 'exact_match',
                            'existing_entities': exact_matches
                        }
                    else:
                        inactive_exact = [m for m in exact_matches if m['status'] != 'ACTIVE']
                        logger.info(f"Found {len(inactive_exact)} inactive exact matches")
                        return {
                            'success': True,
                            'available': True,
                            'message': f'Company name "{company_name}" appears to be available - exact name exists but inactive',
                            'method': 'requests',
                            'conflict_type': 'exact_match_inactive',
                            'existing_entities': exact_matches
                        }
                
                # Check for name conflicts (same base name, different suffix)
                elif name_conflicts:
                    active_conflicts = [m for m in name_conflicts if m['status'] == 'ACTIVE']
                    if active_conflicts:
                        logger.info(f"Found {len(active_conflicts)} active name conflicts")
                        return {
                            'success': True,
                            'available': False,
                            'message': f'Company name "{company_name}" is NOT available - base name "{base_name}" is taken by active entity: {active_conflicts[0]["name"]}',
                            'method': 'requests',
                            'conflict_type': 'name_conflict',
                            'base_name': base_name,
                            'conflicting_entities': name_conflicts
                        }
                    else:
                        inactive_conflicts = [m for m in name_conflicts if m['status'] != 'ACTIVE']
                        logger.info(f"Found {len(inactive_conflicts)} inactive name conflicts")
                        return {
                            'success': True,
                            'available': True,
                            'message': f'Company name "{company_name}" appears to be available - base name "{base_name}" exists but all entities are inactive',
                            'method': 'requests',
                            'conflict_type': 'name_conflict_inactive',
                            'base_name': base_name,
                            'conflicting_entities': name_conflicts
                        }
                
                else:
                    # No exact matches or name conflicts found
                    logger.info(f"No exact matches or name conflicts found, {len(similar_matches)} similar matches")
                    return {
                        'success': True,
                        'available': True,
                        'message': f'Company name "{company_name}" appears to be available - no conflicts found',
                        'method': 'requests',
                        'conflict_type': 'no_conflicts',
                        'base_name': base_name,
                        'similar_entities': similar_matches[:5]  # Show first 5 similar names
                    }
        
        # If we can't find a results table, log the page content for debugging
        logger.warning("Could not find results table, logging page content")
        page_text = results_soup.get_text()[:1000]  # First 1000 chars
        logger.warning(f"Page content preview: {page_text}")
        
        return {
            'success': True,
            'available': True,
            'message': f'Company name "{company_name}" appears to be available (unable to parse results)',
            'method': 'requests',
            'debug_info': 'Could not parse results table'
        }
        
    except Exception as e:
        logger.error(f"Sunbiz check error: {e}")
        raise e
