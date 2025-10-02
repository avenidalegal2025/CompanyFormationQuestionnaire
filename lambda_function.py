import json
import boto3
import time
import logging
import os
import subprocess
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    Lambda function to check company name availability on Sunbiz website
    Optimized for Lambda environment
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
        
        # Try Selenium first, fallback to requests
        try:
            result = check_with_selenium_lambda(company_name, entity_type)
            if result.get('success'):
                return {
                    'statusCode': 200,
                    'body': json.dumps(result)
                }
        except Exception as e:
            logger.warning(f"Selenium failed, trying requests: {e}")
        
        # Fallback to requests/BeautifulSoup
        try:
            result = check_with_requests(company_name, entity_type)
            return {
                'statusCode': 200,
                'body': json.dumps(result)
            }
        except Exception as e:
            logger.error(f"Both methods failed: {e}")
            return {
                'statusCode': 500,
                'body': json.dumps({'error': f'All methods failed: {str(e)}'})
            }
    
    except Exception as e:
        logger.error(f"Lambda handler error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Error checking availability: {str(e)}'})
        }

def check_with_selenium_lambda(company_name, entity_type):
    """
    Check company availability using Selenium optimized for Lambda
    """
    driver = None
    try:
        # Set working directory to writable location
        os.chdir('/tmp')
        
        # Configure Firefox options for Lambda
        options = Options()
        options.headless = True
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-web-security')
        options.add_argument('--disable-features=VizDisplayCompositor')
        options.add_argument('--width=1920')
        options.add_argument('--height=1080')
        
        # Lambda-specific Firefox preferences
        options.set_preference("dom.webdriver.enabled", False)
        options.set_preference("useAutomationExtension", False)
        options.set_preference("general.useragent.override", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        options.set_preference("network.http.response.timeout", 30)
        options.set_preference("network.http.connection-timeout", 30)
        options.set_preference("dom.max_script_run_time", 30)
        options.set_preference("network.proxy.type", 0)  # No proxy
        options.set_preference("browser.cache.disk.enable", False)
        options.set_preference("browser.cache.memory.enable", False)
        options.set_preference("browser.cache.offline.enable", False)
        options.set_preference("network.http.use-cache", False)
        
        # Configure geckodriver service
        service = FirefoxService()
        service.log_output = subprocess.DEVNULL
        
        # Set environment variables
        os.environ['GECKODRIVER_LOG'] = '/dev/null'
        os.environ['MOZ_HEADLESS'] = '1'
        os.environ['DISPLAY'] = ':99'
        
        logger.info("Initializing Firefox driver for Lambda...")
        driver = webdriver.Firefox(service=service, options=options)
        logger.info("Successfully initialized Firefox driver")
        
        # Set shorter timeouts for Lambda
        driver.set_page_load_timeout(30)
        driver.implicitly_wait(10)
        
        # Test with a simple page first
        logger.info("Testing basic connectivity...")
        driver.get('https://httpbin.org/get')
        logger.info("Basic connectivity test passed")
        
        # Now try Sunbiz
        logger.info("Loading Sunbiz search page...")
        driver.get('https://search.sunbiz.org/Inquiry/CorporationSearch/ByName')
        logger.info("Successfully loaded Sunbiz search page")
        
        # Wait for the page to load
        wait = WebDriverWait(driver, 20)
        
        # Find the entity name input field
        search_input = wait.until(EC.presence_of_element_located((By.NAME, "SearchTerm")))
        logger.info("Found search input field")
        
        # Clear and enter company name
        search_input.clear()
        search_input.send_keys(company_name)
        logger.info(f"Entered company name: {company_name}")
        
        # Find and click search button
        search_button = driver.find_element(By.CSS_SELECTOR, "input[type='submit'][value='Search']")
        search_button.click()
        logger.info("Clicked search button")
        
        # Wait for results to load
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "searchResults")))
        logger.info("Search results loaded")
        
        # Check if company name is available
        results = driver.find_elements(By.CSS_SELECTOR, ".searchResults tr")
        
        if len(results) <= 1:  # Only header row
            logger.info("No results found - company name appears to be available")
            return {
                'success': True,
                'available': True,
                'message': f'Company name "{company_name}" appears to be available',
                'method': 'selenium_lambda'
            }
        else:
            logger.info(f"Found {len(results)-1} results - company name may not be available")
            return {
                'success': True,
                'available': False,
                'message': f'Company name "{company_name}" may not be available (found {len(results)-1} similar names)',
                'method': 'selenium_lambda'
            }
    
    except Exception as e:
        logger.error(f"Selenium Lambda error: {e}")
        raise e
    finally:
        if driver:
            try:
                driver.quit()
                logger.info("Firefox driver closed")
            except Exception as e:
                logger.warning(f"Error closing driver: {e}")

def check_with_requests(company_name, entity_type):
    """
    Fallback method using requests/BeautifulSoup
    """
    logger.info(f"Using requests fallback for {company_name}")
    
    try:
        # Create session
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
        # Get the search page first
        search_url = 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName'
        response = session.get(search_url, timeout=30)
        response.raise_for_status()
        
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
            form_data[hidden_input.get('name')] = hidden_input.get('value', '')
        
        # Submit the search
        action_url = form.get('action', search_url)
        if not action_url.startswith('http'):
            action_url = 'https://search.sunbiz.org' + action_url
        
        search_response = session.post(action_url, data=form_data, timeout=30)
        search_response.raise_for_status()
        
        # Parse results
        results_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Look for "No records found" message
        no_results = results_soup.find(text=lambda text: text and 'No records were found' in text)
        if no_results:
            return {
                'success': True,
                'available': True,
                'message': f'Company name "{company_name}" appears to be available',
                'method': 'requests_fallback'
            }
        
        # Look for results table and parse actual results
        results_table = results_soup.find('table', class_='searchResults')
        if not results_table:
            # Try alternative selectors
            results_table = results_soup.find('table', {'id': 'SearchResults'})
        
        if results_table:
            rows = results_table.find_all('tr')
            if len(rows) <= 1:  # Only header
                return {
                    'success': True,
                    'available': True,
                    'message': f'Company name "{company_name}" appears to be available',
                    'method': 'requests_fallback'
                }
            else:
                # Parse each result row to check for exact matches
                exact_matches = []
                similar_matches = []
                
                for row in rows[1:]:  # Skip header row
                    cells = row.find_all('td')
                    if len(cells) >= 3:
                        corporate_name = cells[0].get_text(strip=True).upper()
                        status = cells[2].get_text(strip=True).upper()
                        
                        # Check for exact match (case insensitive)
                        if company_name.upper() in corporate_name or corporate_name in company_name.upper():
                            exact_matches.append({
                                'name': corporate_name,
                                'status': status
                            })
                        else:
                            similar_matches.append({
                                'name': corporate_name,
                                'status': status
                            })
                
                # Check for exact matches first
                if exact_matches:
                    active_matches = [m for m in exact_matches if m['status'] == 'ACTIVE']
                    if active_matches:
                        return {
                            'success': True,
                            'available': False,
                            'message': f'Company name "{company_name}" is NOT available - found active entity: {active_matches[0]["name"]}',
                            'method': 'requests_fallback',
                            'existing_entities': exact_matches
                        }
                    else:
                        inactive_matches = [m for m in exact_matches if m['status'] != 'ACTIVE']
                        return {
                            'success': True,
                            'available': True,
                            'message': f'Company name "{company_name}" appears to be available - found only inactive entities',
                            'method': 'requests_fallback',
                            'existing_entities': exact_matches
                        }
                else:
                    # No exact matches found
                    return {
                        'success': True,
                        'available': True,
                        'message': f'Company name "{company_name}" appears to be available - no exact matches found',
                        'method': 'requests_fallback',
                        'similar_entities': similar_matches[:5]  # Show first 5 similar names
                    }
        
        # If we can't determine, assume available
        return {
            'success': True,
            'available': True,
            'message': f'Company name "{company_name}" appears to be available (unable to parse results)',
            'method': 'requests_fallback'
        }
        
    except Exception as e:
        logger.error(f"Requests fallback error: {e}")
        raise e

def kill_processes(process_names):
    """
    Kill processes by name (from EC2 working code)
    """
    try:
        for name in process_names:
            subprocess.run(['pkill', '-f', name], check=False)
    except FileNotFoundError:
        # pkill not available in Lambda environment, skip
        pass