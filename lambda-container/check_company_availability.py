import json
import boto3
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import logging
import os

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    Lambda function to check company name availability on Florida Sunbiz website
    """
    try:
        # Parse the event
        # The event might come from API Gateway, so check for 'body'
        if 'body' in event:
            body = json.loads(event['body'])
            company_name = body.get('companyName', '').strip()
            entity_type = body.get('entityType', '').strip()
        else:
            company_name = event.get('companyName', '').strip()
            entity_type = event.get('entityType', '').strip()
        
        logger.info(f"Received request for companyName: {company_name}, entityType: {entity_type}")

        if not company_name:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Company name is required',
                    'available': False
                })
            }
        
        # Only check for Florida companies
        if entity_type not in ['LLC', 'C-Corp']:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Only LLC and C-Corp entities are supported for Florida',
                    'available': False
                })
            }
        
        # Set up Firefox options for headless browsing
        firefox_options = Options()
        firefox_options.add_argument('--headless')
        firefox_options.add_argument('--no-sandbox')
        firefox_options.add_argument('--disable-dev-shm-usage')
        firefox_options.add_argument('--disable-gpu')
        firefox_options.add_argument('--window-size=1920,1080')
        firefox_options.add_argument('--disable-extensions')
        firefox_options.add_argument('--disable-plugins')
        firefox_options.add_argument('--disable-images')
        firefox_options.add_argument('--disable-javascript')
        
        # Initialize the driver
        driver = None
        try:
            # Specify the binary locations within the Lambda container
            firefox_binary_path = '/opt/firefox/firefox' # Direct path to Firefox
            geckodriver_binary_path = '/usr/local/bin/geckodriver'

            # Ensure binaries exist (for debugging in Lambda logs)
            logger.info(f"Checking firefox binary at: {firefox_binary_path} - Exists: {os.path.exists(firefox_binary_path)}")
            logger.info(f"Checking geckodriver binary at: {geckodriver_binary_path} - Exists: {os.path.exists(geckodriver_binary_path)}")

            firefox_options.binary_location = firefox_binary_path
            service = Service(executable_path=geckodriver_binary_path)
            driver = webdriver.Firefox(service=service, options=firefox_options)
            logger.info("Successfully initialized Firefox driver")
            
            # Navigate to Sunbiz search page
            driver.get('https://search.sunbiz.org/Inquiry/CorporationSearch/ByName')
            
            # Wait for the page to load
            wait = WebDriverWait(driver, 10)
            
            # Find the entity name input field
            name_input = wait.until(
                EC.presence_of_element_located((By.NAME, 'SearchTerm'))
            )
            
            # Clear and enter the company name
            name_input.clear()
            name_input.send_keys(company_name)
            
            # Find and click the search button
            search_button = driver.find_element(By.XPATH, "//input[@type='submit' and @value='Search']")
            search_button.click()
            
            # Wait for results to load
            time.sleep(2)
            
            # Check if "No records found" message is present
            try:
                no_records = driver.find_element(By.XPATH, "//*[contains(text(), 'No records found') or contains(text(), 'no records found')]")
                if no_records:
                    logger.info(f"No records found for {company_name}. It is available.")
                    return {
                        'statusCode': 200,
                        'body': json.dumps({
                            'available': True,
                            'message': f'Company name "{company_name}" is available',
                            'companyName': company_name,
                            'entityType': entity_type
                        })
                    }
            except NoSuchElementException:
                logger.info(f"No 'No records found' message for {company_name}. Checking table.")
                pass # No "No records found" message, proceed to check table
            
            # Look for search results table
            try:
                # Wait for results table to be present
                wait.until(EC.presence_of_element_located((By.TAG_NAME, 'table')))
                
                # Find the results table (using a more robust XPath)
                results_table = driver.find_element(By.XPATH, "//table[contains(@class, 'searchResults') or contains(@class, 'results') or .//th[contains(text(), 'Corporate Name')]]")
                
                if results_table:
                    # Get all rows in the table
                    rows = results_table.find_elements(By.TAG_NAME, 'tr')
                    
                    # Skip header row, check data rows
                    data_rows = rows[1:] if len(rows) > 1 else []
                    
                    if not data_rows:
                        # If table exists but has no data rows (only header), it means no results found
                        logger.info(f"Results table found but no data rows for {company_name}. It is available.")
                        return {
                            'statusCode': 200,
                            'body': json.dumps({
                                'available': True,
                                'message': f'Company name "{company_name}" is available',
                                'companyName': company_name,
                                'entityType': entity_type
                            })
                        }
                    
                    # Check if any of the results match exactly
                    exact_match = False
                    similar_names = []
                    
                    for row in data_rows:
                        try:
                            cells = row.find_elements(By.TAG_NAME, 'td')
                            if cells and len(cells) >= 1:
                                # Get the company name from the first column
                                company_cell = cells[0].text.strip().upper()
                                similar_names.append(company_cell)
                                
                                # Check for exact match (case insensitive)
                                if company_cell == company_name.upper():
                                    exact_match = True
                                    break
                        except Exception as e:
                            logger.warning(f"Error parsing row: {e}")
                            continue
                    
                    if exact_match:
                        logger.info(f"Exact match found for {company_name}. It is not available.")
                        return {
                            'statusCode': 200,
                            'body': json.dumps({
                                'available': False,
                                'message': f'Company name "{company_name}" is already taken',
                                'companyName': company_name,
                                'entityType': entity_type,
                                'similarNames': similar_names[:5]  # Show first 5 similar names
                            })
                        }
                    else:
                        logger.info(f"No exact match found for {company_name}, but similar names exist. It is available.")
                        return {
                            'statusCode': 200,
                            'body': json.dumps({
                                'available': True,
                                'message': f'Company name "{company_name}" is available (similar names found but not exact match)',
                                'companyName': company_name,
                                'entityType': entity_type,
                                'similarNames': similar_names[:5]  # Show first 5 similar names
                            })
                        }
                        
            except NoSuchElementException:
                logger.warning("No results table found after search.")
                pass
            except TimeoutException:
                logger.warning("Timeout waiting for results table after search.")
                pass
            
            # If we get here, we couldn't determine availability
            logger.warning(f"Could not determine availability for {company_name} after all checks.")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'available': None,
                    'message': f'Could not determine availability for "{company_name}"',
                    'companyName': company_name,
                    'entityType': entity_type
                })
            }
            
        except TimeoutException:
            logger.error("Timeout waiting for page elements during Selenium operation.")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'Timeout waiting for page to load',
                    'available': False
                })
            }
        except Exception as e:
            logger.error(f"Error during web scraping: {str(e)}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': f'Error checking availability: {str(e)}',
                    'available': False
                })
            }
        finally:
            if driver:
                driver.quit()
                logger.info("Selenium driver quit.")
                
    except Exception as e:
        logger.error(f"Lambda function unhandled error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal server error: {str(e)}',
                'available': False
            })
        }
