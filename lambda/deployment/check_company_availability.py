import json
import boto3
import requests
from bs4 import BeautifulSoup
import time
import logging
import re

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
        
        # Use requests and BeautifulSoup instead of Selenium
        try:
            # Set up session with headers to mimic a real browser
            session = requests.Session()
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            })
            
            # First, get the search page to get any necessary cookies or tokens
            search_url = 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName'
            response = session.get(search_url)
            response.raise_for_status()
            
            # Parse the page to get any necessary form data
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find the search form
            search_form = soup.find('form')
            if not search_form:
                logger.error("Could not find search form on the page")
                return {
                    'statusCode': 500,
                    'body': json.dumps({
                        'error': 'Could not find search form on Sunbiz page',
                        'available': False
                    })
                }
            
            # Prepare form data for POST request
            form_data = {}
            
            # Get all input fields from the form
            for input_field in search_form.find_all('input'):
                name = input_field.get('name')
                value = input_field.get('value', '')
                if name:
                    form_data[name] = value
            
            # Set the company name in the search term field
            form_data['SearchTerm'] = company_name
            
            # Submit the search form
            search_response = session.post(search_url, data=form_data)
            search_response.raise_for_status()
            
            # Parse the search results
            results_soup = BeautifulSoup(search_response.text, 'html.parser')
            
            # Check if "No records found" message is present
            no_records_text = results_soup.find(text=re.compile(r'No records found', re.IGNORECASE))
            if no_records_text:
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
            
            # Look for search results table
            results_table = results_soup.find('table')
            if results_table:
                # Get all rows in the table
                rows = results_table.find_all('tr')
                
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
                        cells = row.find_all('td')
                        if cells and len(cells) >= 1:
                            # Get the company name from the first column
                            company_cell = cells[0].get_text(strip=True).upper()
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
            else:
                logger.warning("No results table found after search.")
                # If no table found, assume no results
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'available': True,
                        'message': f'Company name "{company_name}" is available (no results found)',
                        'companyName': company_name,
                        'entityType': entity_type
                    })
                }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error during HTTP request: {str(e)}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': f'Error making request to Sunbiz: {str(e)}',
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
                
    except Exception as e:
        logger.error(f"Lambda function error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal server error: {str(e)}',
                'available': False
            })
        }