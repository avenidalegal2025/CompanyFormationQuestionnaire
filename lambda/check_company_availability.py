import json
import boto3
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    Lambda function to check company name availability on Florida Sunbiz website
    """
    try:
        # Parse the event
        company_name = event.get('companyName', '').strip()
        entity_type = event.get('entityType', '').strip()
        
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
        
        # Set up Chrome options for headless browsing
        chrome_options = Options()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--window-size=1920,1080')
        chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
        
        # Initialize the driver
        driver = None
        try:
            # Try to use Chrome in Lambda environment
            driver = webdriver.Chrome(options=chrome_options)
            
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
            
            # Check if we're on the results page
            try:
                # Look for "No records found" message
                no_records = driver.find_element(By.XPATH, "//*[contains(text(), 'No records found') or contains(text(), 'no records found')]")
                if no_records:
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
                pass
            
            # Look for search results table
            try:
                results_table = driver.find_element(By.XPATH, "//table[contains(@class, 'searchResults') or contains(@class, 'results')]")
                if results_table:
                    # Check if there are any rows with results
                    rows = results_table.find_elements(By.TAG_NAME, 'tr')
                    if len(rows) <= 1:  # Only header row
                        return {
                            'statusCode': 200,
                            'body': json.dumps({
                                'available': True,
                                'message': f'Company name "{company_name}" is available',
                                'companyName': company_name,
                                'entityType': entity_type
                            })
                        }
                    else:
                        # Check if any of the results match exactly
                        exact_match = False
                        for row in rows[1:]:  # Skip header row
                            try:
                                cells = row.find_elements(By.TAG_NAME, 'td')
                                if cells:
                                    company_cell = cells[0].text.strip().upper()
                                    if company_cell == company_name.upper():
                                        exact_match = True
                                        break
                            except:
                                continue
                        
                        if exact_match:
                            return {
                                'statusCode': 200,
                                'body': json.dumps({
                                    'available': False,
                                    'message': f'Company name "{company_name}" is already taken',
                                    'companyName': company_name,
                                    'entityType': entity_type
                                })
                            }
                        else:
                            return {
                                'statusCode': 200,
                                'body': json.dumps({
                                    'available': True,
                                    'message': f'Company name "{company_name}" is available (similar names found but not exact match)',
                                    'companyName': company_name,
                                    'entityType': entity_type
                                })
                            }
            except NoSuchElementException:
                pass
            
            # If we get here, we couldn't determine availability
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
            logger.error("Timeout waiting for page elements")
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
                
    except Exception as e:
        logger.error(f"Lambda function error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal server error: {str(e)}',
                'available': False
            })
        }
