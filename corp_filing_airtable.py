#!/usr/bin/env python3
"""
Corporation Filing Automation Script - Airtable Version
Fetches C-Corp / S-Corp data from Airtable and automates Sunbiz profit-corporation filing.
Uses shared utilities from filing_utils.py.

Sunbiz Corp form: https://efile.sunbiz.org/profit_file.html  (disclaimer)
  -> https://efile.sunbiz.org/scripts/coretype.exe            (form, filing_type=DOMP)

Key differences from LLC:
  - Has stock_shares field
  - Has incorporator section (= Officer 1 / President)
  - Has purpose_flag checkbox for "Any and all lawful business"
  - 6 officer/director slots (off1-off6) with role title codes (P/VP/S/T/D)
  - Filing fee is $70 (LLC is $125)
  - Single-page form -> Continue -> confirmation -> payment
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


# Sunbiz officer role title codes
ROLE_TO_SUNBIZ_TITLE = {
    "President": "P",
    "Vice President": "VP",
    "Secretary": "S",
    "Treasurer": "T",
    "Director": "D",
    # Direct codes also accepted
    "P": "P",
    "VP": "VP",
    "S": "S",
    "T": "T",
    "D": "D",
}

# Corp name must include one of these suffixes
CORP_SUFFIXES = [
    "Corp", "Corp.", "Corporation",
    "Inc", "Inc.", "Incorporated",
    "Company", "Co.",
]


def ensure_corp_suffix(name):
    """Ensure corporation name includes a valid suffix. Appends 'Inc.' if missing."""
    if not name:
        return name
    upper = name.upper()
    for suffix in CORP_SUFFIXES:
        if suffix.upper() in upper:
            return name
    return f"{name} Inc."


# ===================== DATA MAPPING =====================

def _extract_officers_from_airtable(fields):
    """
    Extract officers (1-6) from Airtable fields.
    Returns list of dicts: {first_name, last_name, name, address, role, sunbiz_title}
    """
    officers = []
    for i in range(1, 7):
        first = fields.get(f'Officer {i} First Name', '')
        last = fields.get(f'Officer {i} Last Name', '')
        name = fields.get(f'Officer {i} Name', '')
        addr = fields.get(f'Officer {i} Address', '')
        role = fields.get(f'Officer {i} Role', '')

        if not first and not last and name:
            parts = parse_name(name)
            first = parts.get('first', '')
            last = parts.get('last', '')

        if not first and not last:
            continue  # Skip empty slots

        full_name = name or f"{first} {last}".strip()
        sunbiz_title = ROLE_TO_SUNBIZ_TITLE.get(role, 'D')  # Default to Director if unknown

        officers.append({
            "first_name": first,
            "last_name": last,
            "name": full_name,
            "address": addr,
            "role": role,
            "sunbiz_title": sunbiz_title,
        })

    return officers


def _extract_directors_from_airtable(fields):
    """
    Extract directors (1-6) from Airtable fields.
    Returns list of dicts: {first_name, last_name, name, address}
    """
    directors = []
    for i in range(1, 7):
        first = fields.get(f'Director {i} First Name', '')
        last = fields.get(f'Director {i} Last Name', '')
        name = fields.get(f'Director {i} Name', '')
        addr = fields.get(f'Director {i} Address', '')

        if not first and not last and name:
            parts = parse_name(name)
            first = parts.get('first', '')
            last = parts.get('last', '')

        if not first and not last:
            continue

        directors.append({
            "first_name": first,
            "last_name": last,
            "name": name or f"{first} {last}".strip(),
            "address": addr,
        })

    return directors


def _merge_officers_and_directors(officers, directors, max_slots=6):
    """
    Merge officers and directors into up to 6 Sunbiz slots.
    Officers come first with their role titles.
    Directors (not already listed as an officer) are added with title 'D'.
    """
    merged = []
    seen_names = set()

    # Add officers first
    for off in officers:
        if len(merged) >= max_slots:
            break
        merged.append(off)
        seen_names.add(off["name"].upper())

    # Then add directors that aren't already officers
    for d in directors:
        if len(merged) >= max_slots:
            break
        if d["name"].upper() in seen_names:
            continue
        merged.append({
            **d,
            "role": "Director",
            "sunbiz_title": "D",
        })
        seen_names.add(d["name"].upper())

    return merged


def fetch_corp_data_from_airtable(record_id=None):
    """
    Fetch C-Corp/S-Corp formation data from Airtable.

    Args:
        record_id: Specific Airtable record ID (optional).

    Returns:
        dict: Formatted Corp data for Sunbiz filing, or None.
    """
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)

    if record_id:
        record = table.get(record_id)
        print(f"\U0001f4c2 Fetched specific record: {record['id']}")

        if record['fields'].get('Formation State') != 'Florida':
            raise ValueError(f"Record {record_id} is not a Florida formation - cannot file on Sunbiz")
        entity = record['fields'].get('Entity Type', '')
        if entity not in ('C-Corp', 'S-Corp'):
            raise ValueError(f"Record {record_id} is entity type '{entity}', not C-Corp/S-Corp")
    else:
        formula = """AND(
            OR(
                {Formation Status} = 'Pending',
                {Formation Status} = 'In Progress'
            ),
            {Formation State} = 'Florida',
            {Stripe Payment ID} != '',
            OR(
                {Entity Type} = 'C-Corp',
                {Entity Type} = 'S-Corp'
            ),
            {Autofill} = 'Yes',
            {Formation Status} != 'Filed',
            {Formation Status} != 'Completed'
        )"""

        print("\U0001f50d Searching for Pending Florida C-Corp/S-Corp with Autofill enabled...")
        records = table.all(formula=formula, max_records=1, sort=["-Payment Date"])

        if not records:
            print("\u2139\ufe0f  No Corp formations ready for auto-filing")
            return None

        record = records[0]
        print(f"\U0001f4c2 Found new Corp formation: {record['fields'].get('Company Name')}")

    fields = record['fields']
    entity_type = fields.get('Entity Type', 'C-Corp')

    # ---- Company Name (must include Corp/Inc suffix) ----
    company_name = ensure_corp_suffix(fields.get('Company Name', ''))

    # ---- Number of Shares ----
    stock_shares = str(fields.get('Number of Shares', 1000))

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

    # ---- Officers & Directors ----
    officers = _extract_officers_from_airtable(fields)
    directors = _extract_directors_from_airtable(fields)
    all_people = _merge_officers_and_directors(officers, directors)

    # Find the President (Officer 1) for Incorporator
    president = None
    for p in all_people:
        if p.get("sunbiz_title") == "P":
            president = p
            break
    if not president and all_people:
        president = all_people[0]  # Fallback to first person

    # Parse president address for incorporator section
    president_addr = parse_address(president["address"] if president else '', is_international=True)
    president_country = detect_country_code(president["address"] if president else '')

    # ---- Business Purpose ----
    raw_purpose = fields.get('Business Purpose', 'Any and all lawful business')
    purpose = translate_business_purpose(raw_purpose)
    # Determine if we should check the "Any and all lawful business" checkbox
    purpose_is_generic = purpose.lower().strip() in [
        'any and all lawful business',
        'any lawful purpose',
        'any lawful business',
        'any and all lawful purposes',
    ]

    # ---- Return Contact ----
    contact_name = ''
    if president:
        contact_name = president.get("name", '')
    if not contact_name:
        contact_name = fields.get('Customer Name', '')
    contact_email = fields.get('Customer Email', '')

    print(f"\U0001f3e2 Corporation: {company_name} ({entity_type})")
    print(f"   Shares: {stock_shares}")
    print(f"   Officers: {len(officers)}, Directors: {len(directors)}, Total slots: {len(all_people)}")
    if president:
        print(f"   President/Incorporator: {president['name']}")

    corp_data = {
        "corp": {
            "name": company_name,
            "stock_shares": stock_shares,
            "purpose": purpose,
            "purpose_is_generic": purpose_is_generic,
            "entity_type": entity_type,
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
        "incorporator": {
            "name": president["name"] if president else '',
            "address": president_addr.get('line1', '') + (
                ' ' + president_addr.get('line2', '') if president_addr.get('line2') else ''
            ),
            "suite": '',
            "city_st_zip": _format_city_st_zip(president_addr, president_country),
            "signature": president["name"] if president else '',
        },
        "officers_directors": all_people,
        "return_contact": {
            "name": contact_name,
            "email": contact_email,
        },
        "_airtable_record_id": record['id'],
    }

    return corp_data


def _format_city_st_zip(addr_parts, country_code):
    """Format city, state, zip into a single line for incorporator field (max 60 chars)."""
    city = addr_parts.get('city', '') or ''
    state = addr_parts.get('state', '') or ('FL' if country_code == 'US' else '')
    zipcode = addr_parts.get('zip', '') or ''
    parts = [p for p in [city, state, zipcode] if p]
    return ', '.join(parts)[:60]


# ===================== FORM FILLING =====================

def fill_corp_form(driver, wait, data, company_name):
    """
    Fill the entire Sunbiz Corporation (Domestic Profit) form.
    Wraps each section in try/except for granular error screenshots.
    """
    corp = data["corp"]

    # --- Section 1: Corporation Info ---
    try:
        print("  \U0001f4dd Filling Corporation information...")
        corp_name_el = wait_for_form_field(driver, "corp_name")
        human_typing(corp_name_el, corp["name"])
        human_typing(driver.find_element(By.ID, "stock_shares"), corp["stock_shares"])
        take_and_upload_screenshot(driver, "03_corp_name_shares", company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_corp_info", company_name)
        raise RuntimeError(f"Failed filling Corp info: {e}") from e

    # --- Section 2: Principal Address ---
    try:
        print("  \U0001f4dd Filling principal address...")
        pa = corp["principal_address"]
        human_typing(driver.find_element(By.ID, "princ_addr1"), pa["line1"])
        human_typing(driver.find_element(By.ID, "princ_addr2"), pa["line2"])
        human_typing(driver.find_element(By.ID, "princ_city"), pa["city"])
        human_typing(driver.find_element(By.ID, "princ_st"), pa["state"])
        human_typing(driver.find_element(By.ID, "princ_zip"), pa["zip"])
        human_typing(driver.find_element(By.ID, "princ_cntry"), pa["country"])
        driver.find_element(By.TAG_NAME, "body").click()
        time.sleep(1)
        # Check "same as principal" for mailing address
        driver.find_element(By.ID, "same_addr_flag").click()
        take_and_upload_screenshot(driver, "03b_principal_address", company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_principal_address", company_name)
        raise RuntimeError(f"Failed filling principal address: {e}") from e

    # --- Section 3: Registered Agent ---
    try:
        fill_registered_agent(driver, company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_registered_agent", company_name)
        raise RuntimeError(f"Failed filling Registered Agent: {e}") from e

    # --- Section 4: Incorporator ---
    try:
        print("  \U0001f4dd Filling Incorporator...")
        inc = data["incorporator"]
        human_typing(driver.find_element(By.ID, "incorporator_name"), inc["name"])
        human_typing(driver.find_element(By.ID, "incorporator_address"), inc["address"])
        human_typing(driver.find_element(By.ID, "incorporator_suite"), inc["suite"])
        human_typing(driver.find_element(By.ID, "incorp_city_st_zip"), inc["city_st_zip"])
        # Electronic signature of incorporator
        human_typing(driver.find_element(By.ID, "signature"), inc["signature"])
        take_and_upload_screenshot(driver, "05_incorporator_filled", company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_incorporator", company_name)
        raise RuntimeError(f"Failed filling Incorporator: {e}") from e

    # --- Section 5: Corporate Purpose ---
    try:
        print("  \U0001f4dd Filling corporate purpose...")
        if corp["purpose_is_generic"]:
            # Check the "Any and all lawful business" checkbox
            try:
                purpose_checkbox = driver.find_element(By.ID, "purpose_flag")
                if not purpose_checkbox.is_selected():
                    purpose_checkbox.click()
            except Exception:
                # If checkbox fails, fall back to typing in the textarea
                human_typing(driver.find_element(By.ID, "purpose"), corp["purpose"])
        else:
            human_typing(driver.find_element(By.ID, "purpose"), corp["purpose"])
        take_and_upload_screenshot(driver, "06_purpose_filled", company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_purpose", company_name)
        raise RuntimeError(f"Failed filling purpose: {e}") from e

    # --- Section 6: Correspondence / Return Contact ---
    try:
        contact = data["return_contact"]
        fill_correspondence(driver, contact["name"], contact["email"], company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_correspondence", company_name)
        raise RuntimeError(f"Failed filling correspondence: {e}") from e

    # --- Section 7: Officers and Directors (up to 6 slots) ---
    try:
        print("  \U0001f4dd Filling Officers/Directors...")
        people = data["officers_directors"]

        for idx, person in enumerate(people):
            slot = idx + 1  # off1 through off6
            prefix = f"off{slot}_name_"

            addr_parts = parse_address(person.get("address", ""), is_international=True)
            country = detect_country_code(person.get("address", ""))
            if addr_parts.get('country') == 'INT' and country == 'US':
                country = 'INT'

            human_typing(driver.find_element(By.ID, f"{prefix}title"), person.get("sunbiz_title", "D"))
            human_typing(driver.find_element(By.ID, f"{prefix}last_name"), person.get("last_name", ""))
            human_typing(driver.find_element(By.ID, f"{prefix}first_name"), person.get("first_name", ""))

            # Address
            addr_line = addr_parts.get('line1', '') + (
                ' ' + addr_parts.get('line2', '') if addr_parts.get('line2') else ''
            )
            human_typing(driver.find_element(By.ID, f"{prefix}addr1"), addr_line)
            human_typing(driver.find_element(By.ID, f"{prefix}city"), addr_parts.get('city', '') or 'N/A')
            human_typing(
                driver.find_element(By.ID, f"{prefix}st"),
                addr_parts.get('state', '') or ('FL' if country == 'US' else 'N/A')
            )
            human_typing(
                driver.find_element(By.ID, f"{prefix}zip"),
                addr_parts.get('zip', '') or ('33181' if country == 'US' else '00000')
            )
            human_typing(driver.find_element(By.ID, f"{prefix}cntry"), country)

            print(f"    \u2705 Slot {slot}: {person['sunbiz_title']} - {person.get('name', 'N/A')}")

        take_and_upload_screenshot(driver, "08_officers_filled", company_name)
    except Exception as e:
        take_and_upload_screenshot(driver, "ERROR_officers", company_name)
        raise RuntimeError(f"Failed filling Officers/Directors: {e}") from e

    # Full form screenshot before submission
    take_and_upload_screenshot(driver, "09_before_submit", company_name)


# ===================== MAIN =====================

def main(record_id=None):
    """
    Main Corporation automation flow.

    Args:
        record_id: Optional Airtable record ID. If not provided, fetches first eligible record.
    """
    print("\U0001f680 Starting Corporation Filing Automation (Airtable Version)")
    print("=" * 50)

    # Fetch data from Airtable
    print("\U0001f4e5 Fetching data from Airtable...")
    data = fetch_corp_data_from_airtable(record_id=record_id)

    if data is None:
        print("\n\u2705 No new Corp formations to process. Exiting.")
        return

    corp = data["corp"]
    corp_name = corp["name"].replace(" ", "_")
    airtable_record_id = data.get("_airtable_record_id")
    entity_type = corp.get("entity_type", "C-Corp")

    print(f"\U0001f4cb Processing {entity_type}: {corp['name']}")

    # Validate required fields before starting the browser
    try:
        validate_required_fields(
            {
                "company_name": corp["name"],
                "stock_shares": corp["stock_shares"],
                "incorporator_name": data["incorporator"]["name"],
            },
            ["company_name", "stock_shares", "incorporator_name"],
            entity_type=entity_type,
        )
        if not data["officers_directors"]:
            raise ValueError(f"{entity_type} filing requires at least one officer or director")
    except ValueError as e:
        if airtable_record_id:
            update_airtable_status(airtable_record_id, "Pending", f"Validation error: {e}")
        raise

    # Update status to In Progress
    if airtable_record_id:
        update_airtable_status(airtable_record_id, "In Progress")

    # Fetch payment data
    print("\U0001f4b3 Fetching payment data from SSM...")
    payment = fetch_payment_data_from_ssm(corp_name)

    # Initialize browser
    print("\U0001f98a Starting Firefox browser...")
    driver = init_browser()
    driver.set_page_load_timeout(60)
    wait = WebDriverWait(driver, 30)

    try:
        # Step 1: Navigate to Corp disclaimer page and start filing
        driver.get("https://efile.sunbiz.org/profit_file.html")
        accept_disclaimer_and_start(driver, wait, corp_name)

        # Step 2: Fill the entire Corporation form
        fill_corp_form(driver, wait, data, corp_name)

        # Step 3: Click through Continue pages (Corp typically has 1-2 continues)
        click_continue_through_pages(driver, wait, 2, corp_name)

        # Step 4: Payment
        fill_payment_and_submit(driver, wait, payment, corp_name)

        # Update Airtable status to Filed
        if airtable_record_id:
            update_airtable_status(
                airtable_record_id,
                "Filed",
                f"Filed ({entity_type}) on {datetime.now().isoformat()}",
            )

        print(f"\u2705 {entity_type} Filing completed successfully!")

    except Exception as e:
        print(f"\u274c Error: {e}")

        # Take error screenshot
        try:
            take_and_upload_screenshot(driver, f"ERROR_fatal_{type(e).__name__}", corp_name)
        except Exception:
            pass

        # Log error
        error_log = f"corp_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        with open(error_log, "w") as log:
            import traceback
            log.write(f"Error: {e}\n\n")
            log.write(traceback.format_exc())
        upload_file_to_s3(error_log, corp_name, "errors")

        # Update Airtable with error
        if airtable_record_id:
            update_airtable_status(airtable_record_id, "Pending", f"Error: {str(e)[:200]}")

        raise

    finally:
        driver.quit()
        save_run_log(corp_name, airtable_record_id, entity_type)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg.startswith("rec"):
            main(record_id=arg)
        else:
            print("Usage:")
            print("  python3 corp_filing_airtable.py           # Process next pending C-Corp/S-Corp")
            print("  python3 corp_filing_airtable.py recXXX    # Process specific record ID")
    else:
        main()
