#!/usr/bin/env python3
"""
LLC Filing Automation Script - Airtable Version
Fetches LLC data from Airtable and automates Sunbiz filing
"""
import os
os.environ["DISPLAY"] = ":1"

import time
import random
import json
import subprocess
import base64
from datetime import datetime

import boto3
from pyairtable import Api
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

# ==== CONFIG ====
# Airtable Configuration
AIRTABLE_API_KEY = os.environ.get("AIRTABLE_API_KEY", "YOUR_API_KEY_HERE")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID", "YOUR_BASE_ID_HERE")
AIRTABLE_TABLE_NAME = os.environ.get("AIRTABLE_TABLE_NAME", "Formations")

# AWS Configuration
S3_BUCKET = 'llc-filing-audit-trail-rodolfo'
REGION = 'us-west-1'

# ==== UTILITIES ====
def human_typing(element, text, min_delay=0.03, max_delay=0.12):
    """Type text with human-like delays"""
    if not text:
        return
    for char in str(text):
        element.send_keys(char)
        time.sleep(random.uniform(min_delay, max_delay))

def screenshot(driver, label):
    """Take a screenshot and return filename"""
    filename = f"{label}.png"
    driver.save_screenshot(filename)
    return filename

def upload_file_to_s3(filepath, llc_name, category):
    """Upload file to S3 bucket"""
    s3 = boto3.client("s3", region_name=REGION)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = os.path.basename(filepath)
    key = f"{llc_name}/{category}/{timestamp}_{filename}"
    try:
        s3.upload_file(filepath, S3_BUCKET, key)
        print(f"✅ Uploaded {filename} to s3://{S3_BUCKET}/{key}")
    except Exception as e:
        print(f"❌ Failed to upload {filename}: {e}")

def fetch_payment_data_from_ssm(llc_name):
    """Fetch payment data from AWS SSM Parameter Store"""
    ssm = boto3.client("ssm", region_name=REGION)
    response = ssm.get_parameter(Name="/llc/payment", WithDecryption=True)
    encoded = response['Parameter']['Value']
    decoded = base64.b64decode(encoded).decode('utf-8')
    payment_data = json.loads(decoded)
    
    # Save and upload for audit
    with open("ssm_payment_dump.json", "w") as f:
        json.dump(payment_data, f, indent=2)
    upload_file_to_s3("ssm_payment_dump.json", llc_name, "payments")
    
    return payment_data

def fetch_llc_data_from_airtable(record_id=None):
    """
    Fetch LLC formation data from Airtable
    
    FILTERS (only processes NEW formations from questionnaire):
    - Formation Status = 'Pending' (not yet filed)
    - Formation State = 'Florida' (Sunbiz is for FL only)
    - Internal Status = 'New' (fresh from questionnaire)
    - Has Stripe Payment ID (paid customers only)
    
    Args:
        record_id: Specific Airtable record ID to fetch (optional)
    
    Returns:
        dict: Formatted LLC data for Sunbiz filing
    """
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    
    if record_id:
        # Fetch specific record by ID
        record = table.get(record_id)
        print(f"📂 Fetched specific record: {record['id']}")
        
        # Validate it's a Florida LLC
        if record['fields'].get('Formation State') != 'Florida':
            raise ValueError(f"Record {record_id} is not a Florida LLC - cannot file on Sunbiz")
    else:
        # Build filter for records ready for autofill
        # Requires "Autofill" = "Yes" (can be set manually in Airtable)
        # Includes Pending and In Progress records (In Progress allows manual retry)
        # Excludes already filed or completed records
        formula = """AND(
            OR(
                {Formation Status} = 'Pending',
                {Formation Status} = 'In Progress'
            ),
            {Formation State} = 'Florida',
            {Stripe Payment ID} != '',
            {Entity Type} = 'LLC',
            {Autofill} = 'Yes',
            {Formation Status} != 'Filed',
            {Formation Status} != 'Completed'
        )"""
        
        print("🔍 Searching for Pending Florida LLCs with Autofill enabled...")
        records = table.all(formula=formula, max_records=1, sort=["-Payment Date"])
        
        if not records:
            print("ℹ️  No formations ready for auto-filing")
            print("   Records need: Autofill = 'Yes', Formation Status = 'Pending', State = 'Florida'")
            return None
        
        record = records[0]
        print(f"📂 Found new formation: {record['fields'].get('Company Name')}")
    
    fields = record['fields']
    
    # Map Airtable fields to Sunbiz form structure
    # TEST ADDRESS (for testing purposes only)
    AVENIDA_LEGAL_ADDRESS = {
        "line1": "100 Test Street",
        "line2": "Suite 200",
        "city": "North Miami",
        "state": "FL",
        "zip": "33181",
        "country": "US"
    }
    
    # Parse company address - use Avenida Legal's if incomplete or missing
    company_address = fields.get('Company Address', '')
    address_parts = parse_address(company_address)
    
    # Check if company address is complete US address, otherwise use Avenida Legal's
    has_complete_address = all([
        address_parts.get('line1'),
        address_parts.get('city'),
        address_parts.get('state'),
        address_parts.get('zip')
    ]) and address_parts.get('country') != 'INT'
    
    if not has_complete_address:
        print(f"📍 Using Avenida Legal's address for Principal Address (original: {company_address})")
        address_parts = AVENIDA_LEGAL_ADDRESS.copy()
    
    # Get manager info for authorized person (Manager 1) - CAN BE INTERNATIONAL
    # Use separate first/last name fields if available, otherwise fall back to splitting full name
    manager_first_name = fields.get('Manager 1 First Name', '')
    manager_last_name = fields.get('Manager 1 Last Name', '')
    manager_name = fields.get('Manager 1 Name', '')
    
    # If separate fields aren't filled, fall back to parsing full name
    if not manager_first_name and not manager_last_name and manager_name:
        manager_name_parts = parse_name(manager_name)
        manager_first_name = manager_name_parts.get('first', '')
        manager_last_name = manager_name_parts.get('last', '')
    
    # Full name for signature
    if not manager_name:
        manager_name = f"{manager_first_name} {manager_last_name}".strip()
    
    manager_address = fields.get('Manager 1 Address', '')
    manager_addr_parts = parse_address(manager_address, is_international=True)
    
    # Determine country for manager - check if international
    manager_country = "US"
    if manager_addr_parts.get('country') == 'INT':
        # Try to detect country from address
        addr_upper = manager_address.upper()
        if 'UK' in addr_upper or 'LONDON' in addr_upper or 'ENGLAND' in addr_upper:
            manager_country = "GB"
        elif 'CANADA' in addr_upper or 'TORONTO' in addr_upper or 'VANCOUVER' in addr_upper:
            manager_country = "CA"
        elif 'MEXICO' in addr_upper or 'CIUDAD' in addr_upper:
            manager_country = "MX"
        else:
            manager_country = "INT"  # Generic international
    
    print(f"👤 Manager: {manager_name} | Country: {manager_country}")
    print(f"   Address: {manager_address}")
    
    llc_data = {
        "llc": {
            "name": fields.get('Company Name', ''),
            "purpose": fields.get('Business Purpose', 'Any lawful purpose'),
            "principal_address": {
                "line1": address_parts.get('line1', AVENIDA_LEGAL_ADDRESS['line1']),
                "line2": address_parts.get('line2', AVENIDA_LEGAL_ADDRESS['line2']),
                "city": address_parts.get('city', AVENIDA_LEGAL_ADDRESS['city']),
                "state": address_parts.get('state', AVENIDA_LEGAL_ADDRESS['state']),
                "zip": address_parts.get('zip', AVENIDA_LEGAL_ADDRESS['zip']),
                "country": "US"  # Principal address must be US
            }
        },
        "registered_agent": {
            # TEST Registered Agent - John Doe in North Miami
            "first_name": "JOHN",
            "last_name": "DOE",
            "address1": AVENIDA_LEGAL_ADDRESS['line1'],
            "address2": AVENIDA_LEGAL_ADDRESS['line2'],
            "city": AVENIDA_LEGAL_ADDRESS['city'],
            "zip": AVENIDA_LEGAL_ADDRESS['zip'],
            "signature": "JOHN DOE"
        },
        "authorized_person": {
            # Authorized Person (Manager) - CAN be international
            "title": "MGR",
            "first_name": manager_first_name,
            "last_name": manager_last_name,
            "address": manager_addr_parts.get('line1', '') + (' ' + manager_addr_parts.get('line2', '') if manager_addr_parts.get('line2') else ''),
            "city": manager_addr_parts.get('city', ''),
            "state": manager_addr_parts.get('state', ''),
            "zip": manager_addr_parts.get('zip', ''),
            "country": manager_country,
            "signature": manager_name
        },
        "return_contact": {
            "name": fields.get('Customer Name', ''),
            "email": fields.get('Customer Email', '')
        },
        "_airtable_record_id": record['id']
    }
    
    return llc_data

def parse_address(address_str, is_international=False):
    """Parse address string into components - handles both US and international"""
    if not address_str:
        return {}
    
    parts = {}
    
    # Check if it looks like an international address (contains country codes or non-US patterns)
    international_indicators = ['UK', 'GB', 'CA', 'MX', 'DE', 'FR', 'ES', 'IT', 'AU', 'NZ', 
                                'London', 'Paris', 'Madrid', 'Berlin', 'Toronto', 'Mexico']
    is_international = is_international or any(ind in address_str for ind in international_indicators)
    
    if is_international:
        # For international addresses, keep as single line and extract what we can
        sections = [s.strip() for s in address_str.split(',')]
        if len(sections) >= 2:
            parts['line1'] = sections[0]
            parts['line2'] = ', '.join(sections[1:])  # Rest goes to line2
            # Try to get city from second section
            parts['city'] = sections[1].strip() if len(sections) > 1 else ''
            parts['state'] = ''
            parts['zip'] = ''
            # Try to extract postal code (alphanumeric pattern)
            import re
            postal_match = re.search(r'[A-Z0-9]{2,4}\s*[A-Z0-9]{2,4}', address_str)
            if postal_match:
                parts['zip'] = postal_match.group()
        else:
            parts['line1'] = address_str
            parts['line2'] = ''
        parts['country'] = 'INT'  # Mark as international
        return parts
    
    # US address parsing
    sections = [s.strip() for s in address_str.split(',')]
    
    if len(sections) >= 3:
        # Full address: street, city, state zip
        parts['line1'] = sections[0]
        parts['line2'] = ''
        parts['city'] = sections[1]
        state_zip = sections[2].split()
        if len(state_zip) >= 2:
            parts['state'] = state_zip[0]
            parts['zip'] = state_zip[1]
        elif len(state_zip) == 1:
            parts['state'] = state_zip[0]
            parts['zip'] = ''
    elif len(sections) == 2:
        # street, city state zip
        parts['line1'] = sections[0]
        city_state_zip = sections[1].split()
        if len(city_state_zip) >= 3:
            parts['city'] = ' '.join(city_state_zip[:-2])
            parts['state'] = city_state_zip[-2]
            parts['zip'] = city_state_zip[-1]
        else:
            parts['city'] = sections[1]
            parts['state'] = ''
            parts['zip'] = ''
    else:
        parts['line1'] = address_str
        parts['city'] = ''
        parts['state'] = ''
        parts['zip'] = ''
    
    # Extract suite/unit to line2
    line1 = parts.get('line1', '')
    for sep in [' Ste ', ' Suite ', ' Unit ', ' #']:
        if sep in line1:
            main, suite = line1.split(sep, 1)
            parts['line1'] = main
            parts['line2'] = sep.strip() + ' ' + suite
            break
    
    parts['country'] = 'US'
    return parts

def parse_name(name_str):
    """Parse full name into first and last"""
    if not name_str:
        return {'first': '', 'last': ''}
    
    parts = name_str.strip().split()
    if len(parts) >= 2:
        return {'first': parts[0], 'last': ' '.join(parts[1:])}
    elif len(parts) == 1:
        return {'first': parts[0], 'last': ''}
    return {'first': '', 'last': ''}

def update_airtable_status(record_id, new_status, notes=None):
    """Update the formation status in Airtable"""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    
    update_fields = {'Formation Status': new_status}
    if notes:
        update_fields['Notes'] = notes
    
    table.update(record_id, update_fields)
    print(f"✅ Updated Airtable status to: {new_status}")

def init_browser():
    """Initialize Firefox browser for automation"""
    import tempfile
    
    options = Options()
    
    # Create a fresh temporary profile to avoid conflicts
    profile_dir = tempfile.mkdtemp(prefix="firefox_selenium_")
    options.add_argument("-profile")
    options.add_argument(profile_dir)
    
    # Disable features that cause issues
    options.set_preference("browser.shell.checkDefaultBrowser", False)
    options.set_preference("browser.startup.homepage_override.mstone", "ignore")
    
    driver = webdriver.Firefox(options=options)
    return driver

# ==== MAIN SCRIPT ====
def main(record_id=None):
    """
    Main automation flow
    
    Args:
        record_id: Optional Airtable record ID. If not provided, fetches first eligible record.
    """
    print("🚀 Starting LLC Filing Automation (Airtable Version)")
    print("=" * 50)
    
    # Fetch data from Airtable
    print("📥 Fetching data from Airtable...")
    data = fetch_llc_data_from_airtable(record_id=record_id)
    
    if data is None:
        print("\n✅ No new formations to process. Exiting.")
        return
    
    llc = data["llc"]
    llc_name = llc["name"].replace(" ", "_")
    airtable_record_id = data.get("_airtable_record_id")
    
    print(f"📋 Processing LLC: {llc['name']}")
    
    # Update status to In Progress
    if airtable_record_id:
        update_airtable_status(airtable_record_id, "In Progress")
    
    # Fetch payment data
    print("💳 Fetching payment data from SSM...")
    payment = fetch_payment_data_from_ssm(llc_name)
    
    # Initialize browser
    print("🦊 Starting Firefox browser...")
    driver = init_browser()
    wait = WebDriverWait(driver, 30)
    
    try:
        # Navigate to Sunbiz
        driver.get("https://efile.sunbiz.org/llc_file.html")
        upload_file_to_s3(screenshot(driver, "start"), llc_name, "screenshots")
        
        # Accept disclaimer and start filing
        wait.until(EC.element_to_be_clickable((By.ID, "disclaimer_read"))).click()
        wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@value='Start New Filing']"))).click()
        time.sleep(2)
        
        # === LLC Info ===
        print("📝 Filling LLC information...")
        human_typing(wait.until(EC.presence_of_element_located((By.ID, "corp_name"))), llc["name"])
        human_typing(driver.find_element(By.ID, "princ_addr1"), llc["principal_address"]["line1"])
        human_typing(driver.find_element(By.ID, "princ_addr2"), llc["principal_address"]["line2"])
        human_typing(driver.find_element(By.ID, "princ_city"), llc["principal_address"]["city"])
        human_typing(driver.find_element(By.ID, "princ_st"), llc["principal_address"]["state"])
        human_typing(driver.find_element(By.ID, "princ_zip"), llc["principal_address"]["zip"])
        human_typing(driver.find_element(By.ID, "princ_cntry"), llc["principal_address"]["country"])
        driver.find_element(By.TAG_NAME, "body").click()
        time.sleep(1)
        driver.find_element(By.ID, "same_addr_flag").click()
        upload_file_to_s3(screenshot(driver, "llc_info"), llc_name, "screenshots")
        
        # === Registered Agent ===
        print("📝 Filling Registered Agent information...")
        agent = data["registered_agent"]
        human_typing(driver.find_element(By.ID, "ra_name_last_name"), agent["last_name"])
        human_typing(driver.find_element(By.ID, "ra_name_first_name"), agent["first_name"])
        human_typing(driver.find_element(By.ID, "ra_addr1"), agent["address1"])
        human_typing(driver.find_element(By.ID, "ra_addr2"), agent["address2"])
        human_typing(driver.find_element(By.ID, "ra_city"), agent["city"])
        human_typing(driver.find_element(By.ID, "ra_zip"), agent["zip"])
        human_typing(driver.find_element(By.ID, "ra_signature"), agent["signature"])
        
        # === Purpose ===
        human_typing(driver.find_element(By.ID, "purpose"), llc["purpose"])
        
        # === Return Contact ===
        print("📝 Filling return contact...")
        contact = data["return_contact"]
        human_typing(driver.find_element(By.ID, "ret_name"), contact["name"])
        human_typing(driver.find_element(By.ID, "ret_email_addr"), contact["email"])
        human_typing(driver.find_element(By.ID, "email_addr_verify"), contact["email"])
        human_typing(driver.find_element(By.ID, "signature"), data["authorized_person"]["signature"])
        
        # === Authorized Person (Manager/Member) ===
        print("📝 Filling authorized person...")
        auth = data["authorized_person"]
        human_typing(driver.find_element(By.ID, "off1_name_title"), auth["title"])
        human_typing(driver.find_element(By.ID, "off1_name_last_name"), auth["last_name"])
        human_typing(driver.find_element(By.ID, "off1_name_first_name"), auth["first_name"])
        human_typing(driver.find_element(By.ID, "off1_name_addr1"), auth["address"])
        human_typing(driver.find_element(By.ID, "off1_name_city"), auth["city"])
        human_typing(driver.find_element(By.ID, "off1_name_st"), auth["state"])
        human_typing(driver.find_element(By.ID, "off1_name_zip"), auth["zip"])
        human_typing(driver.find_element(By.ID, "off1_name_cntry"), auth["country"])
        
        # Continue through validation pages
        print("⏭️ Processing form pages...")
        for i in range(3):
            wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='Continue']"))).click()
            time.sleep(2)
            try:
                WebDriverWait(driver, 2).until(EC.alert_is_present()).accept()
            except:
                pass
        
        # Go to payment
        print("💳 Proceeding to payment page...")
        wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='Credit Card Payment']"))).click()
        upload_file_to_s3(screenshot(driver, "payment_start"), llc_name, "screenshots")
        
        # === Payment Form ===
        print("💳 Filling payment information...")
        human_typing(wait.until(EC.presence_of_element_located((By.ID, "CustomerInfo_FirstName"))), payment["pay_first"])
        human_typing(driver.find_element(By.ID, "CustomerInfo_LastName"), payment["pay_last"])
        human_typing(driver.find_element(By.ID, "CustomerInfo_Address1"), payment["pay_address"])
        human_typing(driver.find_element(By.ID, "CustomerInfo_City"), payment["pay_city"])
        Select(driver.find_element(By.ID, "CustomerInfo_State")).select_by_value(payment["pay_state"])
        human_typing(driver.find_element(By.ID, "CustomerInfo_Zip"), payment["pay_zip"])
        human_typing(driver.find_element(By.ID, "Phone"), payment["pay_phone"])
        human_typing(driver.find_element(By.ID, "Email"), payment["pay_email"])
        wait.until(EC.element_to_be_clickable((By.ID, "bntNextCustomerInfo"))).click()
        
        # Handle address verification popup
        try:
            time.sleep(2)
            wait.until(EC.element_to_be_clickable((By.ID, "btn-address-verification"))).click()
        except:
            pass
        
        # Wait for payment page to fully load
        time.sleep(5)
        print("💳 Entering credit card details...")
        
        # Scroll to credit card field and wait for it to be ready
        cc_field = wait.until(EC.presence_of_element_located((By.ID, "CCCardNumber")))
        driver.execute_script("arguments[0].scrollIntoView(true);", cc_field)
        time.sleep(2)
        
        # Click on the field first to focus it, then type
        try:
            cc_field.click()
            time.sleep(0.5)
            human_typing(cc_field, payment["cc_number"])
        except Exception as e:
            print(f"⚠️ Regular typing failed, trying JavaScript: {e}")
            driver.execute_script(f"document.getElementById('CCCardNumber').value = '{payment['cc_number']}';")
        Select(driver.find_element(By.ID, "CCExpirationMonth")).select_by_value(payment["cc_exp_month"])
        Select(driver.find_element(By.ID, "CCExpirationYear")).select_by_value(payment["cc_exp_year"])
        human_typing(driver.find_element(By.ID, "CCCardCVV"), payment["cc_cvv"])
        human_typing(driver.find_element(By.ID, "CCNameOnCard"), payment["cc_name"])
        
        # Submit payment
        wait.until(EC.element_to_be_clickable((By.ID, "bntNextPaymentInfo"))).click()
        wait.until(EC.element_to_be_clickable((By.ID, "submitPayment"))).click()
        
        upload_file_to_s3(screenshot(driver, "final_confirmation"), llc_name, "screenshots")
        
        # Update Airtable status to Filed
        if airtable_record_id:
            update_airtable_status(airtable_record_id, "Filed", f"Filed on {datetime.now().isoformat()}")
        
        print("✅ LLC Filing completed successfully!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        
        # Log error
        with open("llc_error.log", "w") as log:
            log.write(str(e))
        upload_file_to_s3("llc_error.log", llc_name, "errors")
        
        # Update Airtable with error
        if airtable_record_id:
            update_airtable_status(airtable_record_id, "Pending", f"Error: {str(e)[:200]}")
        
        raise
        
    finally:
        driver.quit()
        
        # Save run log
        with open("run.log", "w") as log:
            log.write(f"LLC Name: {llc['name']}\n")
            log.write(f"Airtable Record: {airtable_record_id}\n")
            log.write(f"Timestamp: {datetime.now().isoformat()}\n")
        upload_file_to_s3("run.log", llc_name, "logs")

def list_pending_formations():
    """List all formations ready for auto-filing"""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    
    # SAFETY: Requires "Auto-File Enabled" = "Yes" to be set manually in Airtable
    # Excludes already filed, completed, or in-progress records
    formula = """AND(
        {Formation Status} = 'Pending',
        {Formation State} = 'Florida',
        {Stripe Payment ID} != '',
        {Entity Type} = 'LLC',
        {Auto-File Enabled} = 'Yes',
        {Formation Status} != 'Filed',
        {Formation Status} != 'Completed',
        {Formation Status} != 'In Progress'
    )"""
    
    records = table.all(formula=formula, sort=["-Payment Date"])
    
    if not records:
        print("✅ No formations with 'Auto-File Enabled' = 'Yes'")
        print("   Add this field in Airtable and set to 'Yes' for records you want to process")
        return []
    
    print(f"\n📋 Found {len(records)} formation(s) ready for auto-filing:\n")
    print("-" * 80)
    
    for i, record in enumerate(records, 1):
        fields = record['fields']
        print(f"{i}. {fields.get('Company Name', 'Unknown')}")
        print(f"   Record ID: {record['id']}")
        print(f"   Customer:  {fields.get('Customer Name', 'N/A')} ({fields.get('Customer Email', 'N/A')})")
        print(f"   Paid:      {fields.get('Payment Date', 'N/A')}")
        print("-" * 80)
    
    return records

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        
        if arg == "--list":
            # List pending formations without processing
            list_pending_formations()
        
        elif arg == "--all":
            # Process all pending formations
            print("🚀 Processing ALL pending formations...")
            records = list_pending_formations()
            
            for record in records:
                try:
                    print(f"\n{'='*50}")
                    main(record_id=record['id'])
                except Exception as e:
                    print(f"❌ Failed to process {record['id']}: {e}")
                    continue
        
        elif arg.startswith("rec"):
            # Process specific record by ID
            main(record_id=arg)
        
        else:
            print("Usage:")
            print("  python3 llc_filing_airtable.py           # Process next pending formation")
            print("  python3 llc_filing_airtable.py --list    # List all pending formations")
            print("  python3 llc_filing_airtable.py --all     # Process ALL pending formations")
            print("  python3 llc_filing_airtable.py recXXX    # Process specific record ID")
    else:
        # Process next pending formation
        main()

