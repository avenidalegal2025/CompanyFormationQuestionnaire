#!/usr/bin/env python3
"""
LLC Filing Automation Script - Airtable Version
Fetches LLC data from Airtable and automates Sunbiz filing.
Refactored to use shared utilities from filing_utils.py.
"""
import os
os.environ["DISPLAY"] = ":1"

import sys
import time
from datetime import datetime

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from filing_utils import (
    AVENIDA_LEGAL_ADDRESS,
    REGISTERED_AGENT,
    human_typing,
    screenshot,
    upload_file_to_s3,
    take_and_upload_screenshot,
    fetch_payment_data_from_ssm,
    fetch_airtable_record,
    update_airtable_status,
    parse_address,
    parse_name,
    detect_country_code,
    translate_business_purpose,
    init_browser,
    accept_disclaimer_and_start,
    wait_for_form_field,
    fill_registered_agent,
    fill_correspondence,
    fill_payment_and_submit,
    click_continue_through_pages,
    validate_required_fields,
    save_run_log,
    AIRTABLE_API_KEY,
    AIRTABLE_BASE_ID,
    AIRTABLE_TABLE_NAME,
)
from pyairtable import Api


# ===================== DATA MAPPING =====================

def fetch_llc_data_from_airtable(record_id=None):
    """
    Fetch LLC formation data from Airtable.

    FILTERS (only processes NEW formations from questionnaire):
    - Formation Status = 'Pending' (not yet filed)
    - Formation State = 'Florida' (Sunbiz is for FL only)
    - Has Stripe Payment ID (paid customers only)
    - Autofill = 'Yes'

    Args:
        record_id: Specific Airtable record ID to fetch (optional)

    Returns:
        dict: Formatted LLC data for Sunbiz filing, or None if no eligible records.
    """
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)

    if record_id:
        record = table.get(record_id)
        print(f"\U0001f4c2 Fetched specific record: {record['id']}")

        if record['fields'].get('Formation State') != 'Florida':
            raise ValueError(f"Record {record_id} is not a Florida formation - cannot file on Sunbiz")
    else:
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

        print("\U0001f50d Searching for Pending Florida LLCs with Autofill enabled...")
        records = table.all(formula=formula, max_records=1, sort=["-Payment Date"])

        if not records:
            print("\u2139\ufe0f  No formations ready for auto-filing")
            return None

        record = records[0]
        print(f"\U0001f4c2 Found new formation: {record['fields'].get('Company Name')}")

    fields = record['fields']

    # ---- Parse company address ----
    company_address = fields.get('Company Address', '')
    address_parts = parse_address(company_address)

    has_complete_address = all([
        address_parts.get('line1'),
        address_parts.get('city'),
        address_parts.get('state'),
        address_parts.get('zip'),
    ]) and address_parts.get('country') != 'INT'

    if not has_complete_address:
        print(f"\U0001f4cd Using Avenida Legal's address for Principal Address (original: {company_address})")
        address_parts = AVENIDA_LEGAL_ADDRESS.copy()

    # ---- Manager / Authorized Person ----
    manager_first_name = fields.get('Manager 1 First Name', '')
    manager_last_name = fields.get('Manager 1 Last Name', '')
    manager_name = fields.get('Manager 1 Name', '')

    if not manager_first_name and not manager_last_name and manager_name:
        name_parts = parse_name(manager_name)
        manager_first_name = name_parts.get('first', '')
        manager_last_name = name_parts.get('last', '')

    if not manager_name:
        manager_name = f"{manager_first_name} {manager_last_name}".strip()

    manager_address = fields.get('Manager 1 Address', '')

    # Fallback to Owner 1 if manager fields missing
    if not manager_name and not manager_first_name and not manager_last_name:
        owner1_first = fields.get('Owner 1 First Name', '')
        owner1_last = fields.get('Owner 1 Last Name', '')
        owner1_name = fields.get('Owner 1 Name', '')
        manager_first_name = owner1_first
        manager_last_name = owner1_last
        manager_name = owner1_name or f"{owner1_first} {owner1_last}".strip()
    if not manager_address:
        manager_address = fields.get('Owner 1 Address', '')

    manager_addr_parts = parse_address(manager_address, is_international=True)
    manager_country = detect_country_code(manager_address)
    if manager_addr_parts.get('country') == 'INT' and manager_country == 'US':
        manager_country = 'INT'

    # If manager address is empty/incomplete, use the principal address as fallback
    manager_addr_line = (
        manager_addr_parts.get('line1', '')
        + (' ' + manager_addr_parts.get('line2', '') if manager_addr_parts.get('line2') else '')
    ).strip()
    manager_city = manager_addr_parts.get('city', '')
    manager_state = manager_addr_parts.get('state', '')
    manager_zip = manager_addr_parts.get('zip', '')

    if not manager_addr_line:
        print(f"\u26a0\ufe0f  Manager address missing — falling back to principal address")
        manager_addr_line = address_parts.get('line1', AVENIDA_LEGAL_ADDRESS['line1'])
        manager_city = address_parts.get('city', AVENIDA_LEGAL_ADDRESS['city'])
        manager_state = address_parts.get('state', AVENIDA_LEGAL_ADDRESS['state'])
        manager_zip = address_parts.get('zip', AVENIDA_LEGAL_ADDRESS['zip'])
        manager_country = 'US'

    print(f"\U0001f464 Manager: {manager_name} | Country: {manager_country}")
    print(f"   Address: {manager_address or '(using principal address)'}")

    llc_data = {
        "llc": {
            "name": fields.get('Company Name', ''),
            "purpose": translate_business_purpose(
                fields.get('Business Purpose', 'Any lawful purpose')
            ),
            "principal_address": {
                "line1": address_parts.get('line1', AVENIDA_LEGAL_ADDRESS['line1']),
                "line2": address_parts.get('line2', AVENIDA_LEGAL_ADDRESS.get('line2', '')),
                "city": address_parts.get('city', AVENIDA_LEGAL_ADDRESS['city']),
                "state": address_parts.get('state', AVENIDA_LEGAL_ADDRESS['state']),
                "zip": address_parts.get('zip', AVENIDA_LEGAL_ADDRESS['zip']),
                "country": "US",
            },
        },
        "registered_agent": {
            "first_name": REGISTERED_AGENT['first_name'],
            "last_name": REGISTERED_AGENT['last_name'],
            "address1": REGISTERED_AGENT['address1'],
            "address2": REGISTERED_AGENT.get('address2', ''),
            "city": REGISTERED_AGENT['city'],
            "state": REGISTERED_AGENT.get('state', 'FL'),
            "zip": REGISTERED_AGENT['zip'],
            "signature": f"{REGISTERED_AGENT['first_name']} {REGISTERED_AGENT['last_name']}",
        },
        "authorized_person": {
            "title": "MGR",
            "first_name": manager_first_name,
            "last_name": manager_last_name,
            "address": manager_addr_line,
            "city": manager_city or 'N/A',
            "state": manager_state or ('FL' if manager_country == 'US' else 'N/A'),
            "zip": manager_zip or ('33181' if manager_country == 'US' else '00000'),
            "country": manager_country,
            "signature": manager_name,
        },
        "return_contact": {
            "name": manager_name or fields.get('Owner 1 Name', '') or fields.get('Customer Name', ''),
            "email": fields.get('Customer Email', ''),
        },
        "_airtable_record_id": record['id'],
    }

    return llc_data


# ===================== FORM FILLING =====================

def fill_llc_form(driver, wait, data, company_name):
    """
    Fill the entire Sunbiz LLC form.
    Wraps each section in try/except for granular error screenshots.
    """
    llc = data["llc"]

    # --- Section 1: LLC Info ---
    try:
        print("  \U0001f4dd Filling LLC information...")
        corp_name_el = wait_for_form_field(driver, "corp_name")
        human_typing(corp_name_el, llc["name"])
        human_typing(driver.find_element(By.ID, "princ_addr1"), llc["principal_address"]["line1"])
        human_typing(driver.find_element(By.ID, "princ_addr2"), llc["principal_address"]["line2"])
        human_typing(driver.find_element(By.ID, "princ_city"), llc["principal_address"]["city"])
        human_typing(driver.find_element(By.ID, "princ_st"), llc["principal_address"]["state"])
        human_typing(driver.find_element(By.ID, "princ_zip"), llc["principal_address"]["zip"])
        human_typing(driver.find_element(By.ID, "princ_cntry"), llc["principal_address"]["country"])
        driver.find_element(By.TAG_NAME, "body").click()
        time.sleep(1)
        driver.find_element(By.ID, "same_addr_flag").click()
        take_and_upload_screenshot(driver, "03_llc_info_filled", company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_llc_info", company_name)
        raise RuntimeError(f"Failed filling LLC info section: {e}") from e

    # --- Section 2: Registered Agent ---
    try:
        fill_registered_agent(driver, company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_registered_agent", company_name)
        raise RuntimeError(f"Failed filling Registered Agent: {e}") from e

    # --- Section 3: Purpose ---
    try:
        print("  \U0001f4dd Filling business purpose...")
        human_typing(driver.find_element(By.ID, "purpose"), llc["purpose"])
        take_and_upload_screenshot(driver, "06_purpose_filled", company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_purpose", company_name)
        raise RuntimeError(f"Failed filling purpose: {e}") from e

    # --- Section 4: Correspondence / Return Contact ---
    try:
        contact = data["return_contact"]
        fill_correspondence(driver, contact["name"], contact["email"], company_name)
        # Electronic signature of authorized person
        human_typing(driver.find_element(By.ID, "signature"), data["authorized_person"]["signature"])
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_correspondence", company_name)
        raise RuntimeError(f"Failed filling correspondence: {e}") from e

    # --- Section 5: Authorized Person (Manager/Member) ---
    try:
        print("  \U0001f4dd Filling authorized person (Manager)...")
        auth = data["authorized_person"]
        human_typing(driver.find_element(By.ID, "off1_name_title"), auth["title"])
        human_typing(driver.find_element(By.ID, "off1_name_last_name"), auth["last_name"])
        human_typing(driver.find_element(By.ID, "off1_name_first_name"), auth["first_name"])
        human_typing(driver.find_element(By.ID, "off1_name_addr1"), auth["address"])
        human_typing(driver.find_element(By.ID, "off1_name_city"), auth["city"])
        human_typing(driver.find_element(By.ID, "off1_name_st"), auth["state"])
        human_typing(driver.find_element(By.ID, "off1_name_zip"), auth["zip"])
        human_typing(driver.find_element(By.ID, "off1_name_cntry"), auth["country"])
        take_and_upload_screenshot(driver, "08_manager_filled", company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_authorized_person", company_name)
        raise RuntimeError(f"Failed filling authorized person: {e}") from e

    # Full form screenshot before submission
    take_and_upload_screenshot(driver, "09_before_submit", company_name)


# ===================== MAIN =====================

def main(record_id=None):
    """
    Main LLC automation flow.

    Args:
        record_id: Optional Airtable record ID. If not provided, fetches first eligible record.
    """
    print("\U0001f680 Starting LLC Filing Automation (Airtable Version)")
    print("=" * 50)

    # Fetch data from Airtable
    print("\U0001f4e5 Fetching data from Airtable...")
    data = fetch_llc_data_from_airtable(record_id=record_id)

    if data is None:
        print("\n\u2705 No new formations to process. Exiting.")
        return

    llc = data["llc"]
    llc_name = llc["name"].replace(" ", "_")
    airtable_record_id = data.get("_airtable_record_id")

    print(f"\U0001f4cb Processing LLC: {llc['name']}")

    # Validate required fields before starting the browser
    # Sunbiz requires: company name, manager name, manager title, and full manager address
    try:
        validate_required_fields(
            {
                "company_name": llc["name"],
                "manager_name": data["authorized_person"]["signature"],
                "manager_title": data["authorized_person"]["title"],
                "manager_address": data["authorized_person"]["address"],
                "manager_city": data["authorized_person"]["city"],
                "manager_state": data["authorized_person"]["state"],
                "manager_zip": data["authorized_person"]["zip"],
                "customer_email": data["return_contact"]["email"],
            },
            [
                "company_name",
                "manager_name",
                "manager_title",
                "manager_address",
                "manager_city",
                "manager_state",
                "manager_zip",
                "customer_email",
            ],
            entity_type="LLC",
        )
    except ValueError as e:
        if airtable_record_id:
            update_airtable_status(airtable_record_id, "Pending", f"Validation error: {e}")
        raise

    # Update status to In Progress
    if airtable_record_id:
        update_airtable_status(airtable_record_id, "In Progress")

    # Fetch payment data
    print("\U0001f4b3 Fetching payment data from SSM...")
    payment = fetch_payment_data_from_ssm(llc_name)

    # Initialize browser
    print("\U0001f98a Starting Firefox browser...")
    driver = init_browser()
    driver.set_page_load_timeout(60)
    wait = WebDriverWait(driver, 30)

    try:
        # Step 1: Navigate to LLC disclaimer page and start filing
        driver.get("https://efile.sunbiz.org/llc_file.html")
        accept_disclaimer_and_start(driver, wait, llc_name)

        # Step 2: Fill the entire LLC form
        fill_llc_form(driver, wait, data, llc_name)

        # Step 3: Click through validation / continue pages (LLC has ~3 continues)
        click_continue_through_pages(driver, wait, 3, llc_name)

        # Step 4: Payment
        fill_payment_and_submit(driver, wait, payment, llc_name)

        # Update Airtable status to Filed
        if airtable_record_id:
            update_airtable_status(
                airtable_record_id,
                "Filed",
                f"Filed on {datetime.now().isoformat()}",
            )

        print("\u2705 LLC Filing completed successfully!")

    except Exception as e:
        print(f"\u274c Error: {e}")

        # Take error screenshot
        try:
            take_and_upload_screenshot(driver, f"ERROR_fatal_{type(e).__name__}", llc_name)
        except Exception:
            pass

        # Log error
        error_log = f"llc_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        with open(error_log, "w") as log:
            import traceback
            log.write(f"Error: {e}\n\n")
            log.write(traceback.format_exc())
        upload_file_to_s3(error_log, llc_name, "errors")

        # Update Airtable with error
        if airtable_record_id:
            update_airtable_status(airtable_record_id, "Pending", f"Error: {str(e)[:200]}")

        raise

    finally:
        driver.quit()
        save_run_log(llc_name, airtable_record_id, "LLC")


def list_pending_formations():
    """List all LLC formations ready for auto-filing."""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)

    formula = """AND(
        {Formation Status} = 'Pending',
        {Formation State} = 'Florida',
        {Stripe Payment ID} != '',
        {Entity Type} = 'LLC',
        {Autofill} = 'Yes',
        {Formation Status} != 'Filed',
        {Formation Status} != 'Completed',
        {Formation Status} != 'In Progress'
    )"""

    records = table.all(formula=formula, sort=["-Payment Date"])

    if not records:
        print("\u2705 No LLC formations with Autofill = 'Yes'")
        return []

    print(f"\n\U0001f4cb Found {len(records)} LLC formation(s) ready for auto-filing:\n")
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
    if len(sys.argv) > 1:
        arg = sys.argv[1]

        if arg == "--list":
            list_pending_formations()
        elif arg == "--all":
            print("\U0001f680 Processing ALL pending LLC formations...")
            recs = list_pending_formations()
            for rec in recs:
                try:
                    print(f"\n{'=' * 50}")
                    main(record_id=rec['id'])
                except Exception as e:
                    print(f"\u274c Failed to process {rec['id']}: {e}")
                    continue
        elif arg.startswith("rec"):
            main(record_id=arg)
        else:
            print("Usage:")
            print("  python3 llc_filing_airtable.py           # Process next pending LLC")
            print("  python3 llc_filing_airtable.py --list    # List all pending LLCs")
            print("  python3 llc_filing_airtable.py --all     # Process ALL pending LLCs")
            print("  python3 llc_filing_airtable.py recXXX    # Process specific record ID")
    else:
        main()
