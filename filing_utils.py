#!/usr/bin/env python3
"""
Shared utilities for Sunbiz filing automation (LLC + Corporation).
Used by llc_filing_airtable.py and corp_filing_airtable.py.
"""
import os
import re
import time
import random
import json
import base64
import shutil
import subprocess
import tempfile
from datetime import datetime

import boto3
import requests
from pyairtable import Api
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

# ==== CONFIG ====
AIRTABLE_API_KEY = os.environ.get("AIRTABLE_API_KEY", "")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID", "")
AIRTABLE_TABLE_NAME = os.environ.get("AIRTABLE_TABLE_NAME", "Formations")

S3_BUCKET = 'llc-filing-audit-trail-rodolfo'
REGION = 'us-west-1'
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
# Business-purpose translation runs on Bedrock by default so all spend lands on
# the Avenida Legal AWS bill; OpenAI is the fallback (its account ran out of
# credits on 2026-09-24 and 'RESTAURANTE' went on a SunBiz form untranslated).
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-micro-v1:0")
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")  # no Bedrock in us-west-1

# Avenida Legal address (default RA address; override via AVENIDA_ADDRESS_* env)
AVENIDA_LEGAL_ADDRESS = {
    "line1": os.environ.get("AVENIDA_ADDRESS_LINE1", "12550 Biscayne Blvd"),
    "line2": os.environ.get("AVENIDA_ADDRESS_LINE2", "Ste 110"),
    "city": os.environ.get("AVENIDA_ADDRESS_CITY", "North Miami"),
    "state": os.environ.get("AVENIDA_ADDRESS_STATE", "FL"),
    "zip": os.environ.get("AVENIDA_ADDRESS_ZIP", "33181"),
    "country": "US",
}

# Registered Agent — always Antonio/Avenida in production; the real name/address
# come from env (RA_FIRST_NAME/RA_LAST_NAME/RA_ADDRESS_*). The built-in values
# are placeholders so a misconfigured environment is loud, never silently wrong.
RA_ENV_VARS = [
    "RA_FIRST_NAME", "RA_LAST_NAME",
    "RA_ADDRESS_LINE1", "RA_ADDRESS_LINE2", "RA_ADDRESS_CITY",
    "RA_ADDRESS_STATE", "RA_ADDRESS_ZIP",
]
REGISTERED_AGENT = {
    "first_name": os.environ.get("RA_FIRST_NAME", "JOHN"),
    "last_name": os.environ.get("RA_LAST_NAME", "DOE"),
    "address1": os.environ.get("RA_ADDRESS_LINE1", AVENIDA_LEGAL_ADDRESS["line1"]),
    "address2": os.environ.get("RA_ADDRESS_LINE2", AVENIDA_LEGAL_ADDRESS["line2"]),
    "city": os.environ.get("RA_ADDRESS_CITY", AVENIDA_LEGAL_ADDRESS["city"]),
    "state": os.environ.get("RA_ADDRESS_STATE", AVENIDA_LEGAL_ADDRESS["state"]),
    "zip": os.environ.get("RA_ADDRESS_ZIP", AVENIDA_LEGAL_ADDRESS["zip"]),
}

_ra_missing = [v for v in RA_ENV_VARS if not os.environ.get(v)]
if _ra_missing:
    # RA_PLACEHOLDER_IN_USE is a stable token so a CloudWatch metric filter can
    # alarm on it (mirrors SS4_TRANSLATION_FAILED in lambda-functions/ss4_lambda_s3_complete.py).
    print(f"===> RA_PLACEHOLDER_IN_USE — placeholder Registered Agent value(s) in use; "
          f"set env: {', '.join(_ra_missing)}")


# ===================== UTILITIES =====================

def human_typing(element, text, min_delay=0.03, max_delay=0.12):
    """Type text character-by-character with human-like random delays."""
    if not text:
        return
    for char in str(text):
        element.send_keys(char)
        time.sleep(random.uniform(min_delay, max_delay))


def set_field(driver, field_id, value):
    """
    Set a form field by ID, auto-handling <select> dropdowns vs text inputs.

    Sunbiz renders some fields (notably the country field `princ_cntry` /
    `off1_name_cntry`, and sometimes the state field) as a <select>. Sending
    keystrokes (human_typing) into a <select> is unreliable and can leave it on
    its default/blank option — which is what produced the empty-Country bug.
    For a <select> we use a real Select interaction; for anything else we type.
    """
    if value is None:
        value = ""
    el = driver.find_element(By.ID, field_id)
    tag = (el.tag_name or "").lower()

    if tag != "select":
        human_typing(el, value)
        return

    sel = Select(el)
    val = str(value).strip()
    if not val:
        return
    # 1) exact option value, 2) exact visible text
    for selector in (sel.select_by_value, sel.select_by_visible_text):
        try:
            selector(val)
            return
        except Exception:
            pass
    # 3) case-insensitive exact/partial match on value or visible text
    target = val.lower()
    for opt in sel.options:
        ov = (opt.get_attribute("value") or "").strip().lower()
        ot = (opt.text or "").strip().lower()
        if target in (ov, ot) or (target and (target in ov or target in ot)):
            sel.select_by_value(opt.get_attribute("value"))
            return
    # 4) last resort: type into it (keeps old behavior rather than failing hard)
    human_typing(el, val)


def screenshot(driver, label):
    """Take a screenshot and return the local filename."""
    filename = f"{label}.png"
    driver.save_screenshot(filename)
    return filename


def upload_file_to_s3(filepath, company_name, category):
    """Upload a local file to S3 under {company_name}/{category}/."""
    s3 = boto3.client("s3", region_name=REGION)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = os.path.basename(filepath)
    key = f"{company_name}/{category}/{timestamp}_{filename}"
    try:
        s3.upload_file(filepath, S3_BUCKET, key)
        print(f"  \u2705 Uploaded {filename} to s3://{S3_BUCKET}/{key}")
    except Exception as e:
        print(f"  \u274c Failed to upload {filename}: {e}")


# ===================== SCREEN RECORDING (evidence video) =====================

VIDEO_AIRTABLE_FIELD = "Filing Video"


def start_screen_recording(label):
    """Record the Xvfb display for the duration of a filing run. Returns a
    recording handle, or None if ffmpeg is unavailable (filing proceeds)."""
    if shutil.which("ffmpeg") is None:
        print("===> SCREEN_RECORDING_UNAVAILABLE (no ffmpeg on instance)")
        return None
    display = os.environ.get("DISPLAY", ":1")
    size = "1920x1080"
    try:
        out = subprocess.run(["xdpyinfo", "-display", display],
                             capture_output=True, text=True, timeout=10).stdout
        m = re.search(r"dimensions:\s+(\d+x\d+)", out)
        if m:
            size = m.group(1)
    except Exception:
        pass
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", label)[:40]
    path = f"/tmp/filing_{safe}_{ts}.mp4"
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-f", "x11grab", "-video_size", size, "-i", display,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", path],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"  \U0001f3ac Screen recording started ({size}, {path})")
    return {"proc": proc, "path": path}


def stop_screen_recording(rec):
    """Stop ffmpeg gracefully ('q' finalizes the mp4) and return the path, or
    None if the file is missing/suspiciously small."""
    if not rec:
        return None
    proc = rec["proc"]
    try:
        proc.communicate(input=b"q", timeout=20)
    except Exception:
        proc.kill()
        proc.wait()
    path = rec["path"]
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return path
    print("===> SCREEN_RECORDING_EMPTY (no usable video produced)")
    return None


def upload_filing_video(filepath, company_name, dry_run=False):
    """Upload the run video under {company}/videos/ and return a 7-day
    presigned URL for the Airtable 'Filing Video' field (None on failure).
    Dry-run videos are prefixed DRYRUN_ so nobody mistakes one for a filing."""
    if not filepath:
        return None
    s3 = boto3.client("s3", region_name=REGION)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    prefix = "DRYRUN_" if dry_run else ""
    key = f"{company_name}/videos/{timestamp}_{prefix}filing.mp4"
    try:
        s3.upload_file(filepath, S3_BUCKET, key)
        url = s3.generate_presigned_url(
            "get_object", Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=7 * 24 * 3600)
        print(f"  \u2705 Uploaded filing video to s3://{S3_BUCKET}/{key}")
        return url
    except Exception as e:
        print(f"  \u274c Failed to upload filing video: {e}")
        return None


def take_and_upload_screenshot(driver, label, company_name):
    """Convenience: screenshot + upload to S3 in one call."""
    filepath = screenshot(driver, label)
    upload_file_to_s3(filepath, company_name, "screenshots")
    return filepath


def fetch_payment_data_from_ssm(company_name):
    """Fetch payment credentials from AWS SSM Parameter Store (base64-encoded JSON)."""
    ssm = boto3.client("ssm", region_name=REGION)
    response = ssm.get_parameter(Name="/llc/payment", WithDecryption=True)
    encoded = response["Parameter"]["Value"]
    decoded = base64.b64decode(encoded).decode("utf-8")
    payment_data = json.loads(decoded)

    # Save and upload for audit trail
    dump_path = "ssm_payment_dump.json"
    with open(dump_path, "w") as f:
        json.dump(payment_data, f, indent=2)
    upload_file_to_s3(dump_path, company_name, "payments")

    return payment_data


# ===================== AIRTABLE =====================

def fetch_airtable_record(record_id):
    """Fetch a single Airtable record by ID. Returns (record_dict, fields_dict)."""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    record = table.get(record_id)
    return record, record["fields"]


def update_airtable_status(record_id, new_status, notes=None):
    """Update Formation Status (and optionally Notes) in Airtable."""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    update_fields = {"Formation Status": new_status}
    if notes:
        update_fields["Notes"] = notes
    table.update(record_id, update_fields)
    print(f"\u2705 Updated Airtable status to: {new_status}")


def flag_needs_review(record_id, message):
    """Fail-visible gate: mark the record 'Needs Review' with an error note
    naming the offending field, instead of silently substituting data.
    Respects DRY_RUN (prints instead of writing)."""
    print(f"\u274c NEEDS_REVIEW — {message}")
    if os.environ.get("DRY_RUN") == "1":
        print("\U0001f9ea DRY RUN — would set Formation Status = 'Needs Review' in Airtable.")
        return
    # typecast=True lets Airtable auto-create the 'Needs Review' select option
    # if it doesn't exist yet (a plain update would 422 on the unknown choice).
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    table.update(record_id, {"Formation Status": "Needs Review", "Notes": message}, typecast=True)
    print("\u2705 Updated Airtable status to: Needs Review")


# ===================== ADDRESS / NAME PARSING =====================

def parse_address(address_str, is_international=False):
    """
    Parse an address string into components.
    Returns dict with keys: line1, line2, city, state, zip, country.
    """
    if not address_str:
        return {}

    parts = {}

    # Detect international addresses.
    # IMPORTANT: only match full country/region NAMES, never bare 2-letter codes.
    # Bare codes like "CA"/"IT"/"DE" collide with US state abbreviations and with
    # ordinary substrings, which previously misflagged US addresses (e.g.
    # "100 Main St, Sacramento, CA 90001") as international -> country='INT' ->
    # has_complete_address became False -> the principal address was silently
    # replaced with Avenida Legal's own address. That was the "info not mapped" bug.
    international_keywords = [
        "United Kingdom", "England", "Scotland", "Wales", "London", "Manchester",
        "Canada", "Toronto", "Vancouver", "Montreal", "Ontario", "Quebec",
        "Mexico", "México", "Guadalajara", "Monterrey",
        "France", "Paris", "Germany", "Berlin", "Spain", "Madrid",
        "Italy", "Rome", "Australia", "Sydney", "New Zealand", "Auckland",
    ]
    lowered = address_str.lower()
    is_international = is_international or any(kw.lower() in lowered for kw in international_keywords)

    if is_international:
        sections = [s.strip() for s in address_str.split(",")]
        if len(sections) >= 2:
            parts["line1"] = sections[0]
            parts["line2"] = ", ".join(sections[1:])
            parts["city"] = sections[1].strip() if len(sections) > 1 else ""
            parts["state"] = ""
            parts["zip"] = ""
            postal_match = re.search(r"[A-Z0-9]{2,4}\s*[A-Z0-9]{2,4}", address_str)
            if postal_match:
                parts["zip"] = postal_match.group()
        else:
            parts["line1"] = address_str
            parts["line2"] = ""
        parts["country"] = "INT"
        return parts

    # US address parsing
    sections = [s.strip() for s in address_str.split(",")]

    if len(sections) >= 3:
        parts["line1"] = sections[0]
        parts["line2"] = ""
        parts["city"] = sections[1]
        state_zip = sections[2].split()
        if len(state_zip) >= 2:
            parts["state"] = state_zip[0]
            parts["zip"] = state_zip[1]
        elif len(state_zip) == 1:
            parts["state"] = state_zip[0]
            parts["zip"] = ""
    elif len(sections) == 2:
        parts["line1"] = sections[0]
        city_state_zip = sections[1].split()
        if len(city_state_zip) >= 3:
            parts["city"] = " ".join(city_state_zip[:-2])
            parts["state"] = city_state_zip[-2]
            parts["zip"] = city_state_zip[-1]
        else:
            parts["city"] = sections[1]
            parts["state"] = ""
            parts["zip"] = ""
    else:
        parts["line1"] = address_str
        parts["city"] = ""
        parts["state"] = ""
        parts["zip"] = ""

    # Extract suite/unit to line2
    line1 = parts.get("line1", "")
    for sep in [" Ste ", " Suite ", " Unit ", " #"]:
        if sep in line1:
            main, suite = line1.split(sep, 1)
            parts["line1"] = main
            parts["line2"] = sep.strip() + " " + suite
            break

    parts["country"] = "US"
    return parts


def parse_name(name_str):
    """Split a full name into first and last name."""
    if not name_str:
        return {"first": "", "last": ""}
    parts = name_str.strip().split()
    if len(parts) >= 2:
        return {"first": parts[0], "last": " ".join(parts[1:])}
    elif len(parts) == 1:
        return {"first": parts[0], "last": ""}
    return {"first": "", "last": ""}


def detect_country_code(address_str):
    """Attempt to detect a 2-letter country code from an address string."""
    if not address_str:
        return "US"
    upper = address_str.upper()
    if any(kw in upper for kw in ["UK", "LONDON", "ENGLAND", "UNITED KINGDOM"]):
        return "GB"
    if any(kw in upper for kw in ["CANADA", "TORONTO", "VANCOUVER", "MONTREAL"]):
        return "CA"
    if any(kw in upper for kw in ["MEXICO", "CIUDAD", "GUADALAJARA"]):
        return "MX"
    return "US"


def looks_spanish(text):
    """Heuristic: accented chars or common uppercase Spanish business words."""
    if not text:
        return False
    if re.search(r"[áéíóúñÁÉÍÓÚÑ¿¡]", text):
        return True
    WORDS = ("RESTAURANTE", "NEGOCIO", "SERVICIO", "SERVICIOS", "VENTA", "VENTAS",
             "CONSULTORIA", "COMERCIO", "CONSTRUCCION", "TRANSPORTE", "IMPORTACION",
             "EXPORTACION", "ALIMENTOS", "INMOBILIARIA", "PELUQUERIA", "TIENDA")
    upper = text.upper()
    return any(w in upper for w in WORDS)


def translate_business_purpose(text):
    """Translate business purpose to English. Bedrock first (Avenida AWS bill),
    OpenAI as fallback, original text as last resort (logged, and the callers
    refuse to file if it still looks Spanish)."""
    if not text:
        return "Any lawful purpose"
    prompt = ("Translate to concise business-purpose English. "
              "Return only the translation.\n\n" + str(text))

    if BEDROCK_MODEL_ID:
        try:
            brt = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
            body = {
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {"maxTokens": 120, "temperature": 0.2},
            }
            res = brt.invoke_model(modelId=BEDROCK_MODEL_ID, body=json.dumps(body))
            out = json.loads(res["body"].read())
            translated = (out["output"]["message"]["content"][0]["text"] or "").strip()
            if translated:
                return translated
            print(f"===> PURPOSE_TRANSLATION_FAILED (bedrock empty) for '{str(text)[:50]}'")
        except Exception as e:
            # Stable token for a CloudWatch metric filter, mirroring
            # SS4_TRANSLATION_FAILED.
            print(f"===> PURPOSE_TRANSLATION_FAILED (bedrock {BEDROCK_MODEL_ID} "
                  f"@{BEDROCK_REGION}) for '{str(text)[:50]}': {str(e)[:160]}")

    if OPENAI_API_KEY:
        try:
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "Translate to concise business-purpose English. Return only the translation."},
                    {"role": "user", "content": str(text)},
                ],
                "temperature": 0.2,
            }
            res = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=20,
            )
            if res.ok:
                data = res.json()
                translated = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
                if translated:
                    return translated
            else:
                # 2026-09-24: fired as HTTP 429 credit_balance_exhausted and
                # 'RESTAURANTE' went on a SunBiz form untranslated — silently,
                # until the dress rehearsal saw it.
                print(f"===> PURPOSE_TRANSLATION_FAILED (openai HTTP {res.status_code}) for "
                      f"'{str(text)[:50]}': {res.text[:160]}")
        except Exception as e:
            print(f"===> PURPOSE_TRANSLATION_FAILED (openai exception) for '{str(text)[:50]}': {e}")
    return text


# ===================== BROWSER =====================

def init_browser():
    """Initialize Firefox browser for Selenium automation."""
    options = Options()
    profile_dir = tempfile.mkdtemp(prefix="firefox_selenium_")
    options.add_argument("-profile")
    options.add_argument(profile_dir)
    options.set_preference("browser.shell.checkDefaultBrowser", False)
    options.set_preference("browser.startup.homepage_override.mstone", "ignore")
    # Disable "Save address?" and "Save password?" popups
    options.set_preference("extensions.formautofill.addresses.enabled", False)
    options.set_preference("extensions.formautofill.creditCards.enabled", False)
    options.set_preference("signon.rememberSignons", False)
    options.set_preference("signon.autofillForms", False)
    # Disable other popups that can interfere with automation
    options.set_preference("dom.webnotifications.enabled", False)
    options.set_preference("browser.urlbar.suggest.searches", False)
    driver = webdriver.Firefox(options=options)
    return driver


# ===================== SUNBIZ COMMON STEPS =====================

def accept_disclaimer_and_start(driver, wait, company_name):
    """
    Accept the Sunbiz disclaimer checkbox and click 'Start New Filing'.
    Works for both LLC (llc_file.html) and Corp (profit_file.html) — same IDs.
    """
    take_and_upload_screenshot(driver, "01_start", company_name)

    try:
        disclaimer = wait.until(EC.element_to_be_clickable((By.ID, "disclaimer_read")))
        disclaimer.click()
    except Exception:
        # Fallback: try checkbox by label text
        disclaimer = driver.find_element(
            By.XPATH,
            "//input[@type='checkbox' and (contains(../., 'accept the terms') or contains(../., 'read and accept'))]",
        )
        driver.execute_script("arguments[0].click();", disclaimer)

    time.sleep(1.5)

    start_btn = driver.find_element(By.XPATH, "//input[@value='Start New Filing']")
    WebDriverWait(driver, 10).until(lambda d: start_btn.get_attribute("disabled") is None)
    start_btn.click()
    time.sleep(3)

    take_and_upload_screenshot(driver, "02_form_loaded", company_name)


def wait_for_form_field(driver, field_id, timeout=25):
    """
    Wait for a form field to appear (handle possible iframes).
    Returns the WebElement or raises RuntimeError.
    """
    page_wait = WebDriverWait(driver, timeout)
    element = None
    try:
        element = page_wait.until(EC.presence_of_element_located((By.ID, field_id)))
    except Exception:
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        for iframe in iframes:
            try:
                driver.switch_to.frame(iframe)
                element = page_wait.until(EC.presence_of_element_located((By.ID, field_id)))
                break
            except Exception:
                driver.switch_to.default_content()
                continue

    if element is None:
        raise RuntimeError(f"Form did not load: field '{field_id}' not found (check screenshots)")

    page_wait.until(EC.visibility_of(element))
    time.sleep(0.5)
    return element


def fill_registered_agent(driver, company_name, ra=None):
    """Fill the Registered Agent section (same field IDs for LLC and Corp)."""
    if ra is None:
        ra = REGISTERED_AGENT

    print("  \U0001f4dd Filling Registered Agent...")
    human_typing(driver.find_element(By.ID, "ra_name_last_name"), ra["last_name"])
    human_typing(driver.find_element(By.ID, "ra_name_first_name"), ra["first_name"])
    human_typing(driver.find_element(By.ID, "ra_addr1"), ra["address1"])
    human_typing(driver.find_element(By.ID, "ra_addr2"), ra.get("address2", ""))
    human_typing(driver.find_element(By.ID, "ra_city"), ra["city"])
    try:
        human_typing(driver.find_element(By.ID, "ra_st"), ra.get("state", "FL"))
    except Exception:
        pass  # Some forms hardcode FL
    human_typing(driver.find_element(By.ID, "ra_zip"), ra["zip"])
    human_typing(driver.find_element(By.ID, "ra_signature"), f"{ra['first_name']} {ra['last_name']}")

    take_and_upload_screenshot(driver, "04_ra_filled", company_name)


def fill_correspondence(driver, contact_name, email, company_name):
    """Fill the return contact / correspondence section."""
    print("  \U0001f4dd Filling correspondence...")
    human_typing(driver.find_element(By.ID, "ret_name"), contact_name)
    human_typing(driver.find_element(By.ID, "ret_email_addr"), email)
    human_typing(driver.find_element(By.ID, "email_addr_verify"), email)

    take_and_upload_screenshot(driver, "07_contact_filled", company_name)


def fill_payment_and_submit(driver, wait, payment, company_name):
    """Fill the payment form and submit (shared between LLC and Corp).

    DRY_RUN safety gate: when env DRY_RUN=1, stop here — BEFORE clicking
    'Credit Card Payment', before entering any card data, and before submitting.
    This is the single chokepoint where a real $125 charge + real state filing
    would happen, so the no-payment verification run hard-stops at this line.
    """
    if os.environ.get("DRY_RUN") == "1":
        print("\U0001f9ea DRY RUN — stopping BEFORE payment/submit. No card entered, no charge, no filing.")
        try:
            take_and_upload_screenshot(driver, "DRY_RUN_stopped_before_payment", company_name)
        except Exception:
            pass
        return
    print("\U0001f4b3 Proceeding to payment page...")
    wait.until(EC.element_to_be_clickable(
        (By.XPATH, "//input[@type='submit' and @value='Credit Card Payment']")
    )).click()

    take_and_upload_screenshot(driver, "11_payment_start", company_name)

    print("\U0001f4b3 Filling payment information...")
    human_typing(
        wait.until(EC.presence_of_element_located((By.ID, "CustomerInfo_FirstName"))),
        payment["pay_first"],
    )
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
    except Exception:
        pass

    time.sleep(5)
    print("\U0001f4b3 Entering credit card details...")

    cc_field = wait.until(EC.presence_of_element_located((By.ID, "CCCardNumber")))
    driver.execute_script("arguments[0].scrollIntoView(true);", cc_field)
    time.sleep(2)

    try:
        cc_field.click()
        time.sleep(0.5)
        human_typing(cc_field, payment["cc_number"])
    except Exception as e:
        print(f"  \u26a0\ufe0f Regular typing failed, trying JavaScript: {e}")
        driver.execute_script(
            f"document.getElementById('CCCardNumber').value = '{payment['cc_number']}';"
        )

    Select(driver.find_element(By.ID, "CCExpirationMonth")).select_by_value(payment["cc_exp_month"])
    Select(driver.find_element(By.ID, "CCExpirationYear")).select_by_value(payment["cc_exp_year"])
    human_typing(driver.find_element(By.ID, "CCCardCVV"), payment["cc_cvv"])
    human_typing(driver.find_element(By.ID, "CCNameOnCard"), payment["cc_name"])

    take_and_upload_screenshot(driver, "12_payment_filled", company_name)

    # Submit payment
    wait.until(EC.element_to_be_clickable((By.ID, "bntNextPaymentInfo"))).click()
    take_and_upload_screenshot(driver, "13_review_before_submit", company_name)
    wait.until(EC.element_to_be_clickable((By.ID, "submitPayment"))).click()

    # Wait for the processor to respond, then capture the ACTUAL result page
    # (approved / declined). Without this wait the screenshot catches the
    # pre-response page and we can't tell what really happened.
    time.sleep(10)
    take_and_upload_screenshot(driver, "14_payment_result", company_name)


def click_continue_through_pages(driver, wait, num_continues, company_name):
    """Click 'Continue' submit buttons, handling alert popups."""
    print("  \u23ed\ufe0f Processing form pages...")
    for i in range(num_continues):
        try:
            wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//input[@type='submit' and @value='Continue']")
            )).click()
        except Exception:
            # Fallback: try any submit button
            wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//input[@type='submit']")
            )).click()
        time.sleep(2)
        try:
            WebDriverWait(driver, 2).until(EC.alert_is_present()).accept()
        except Exception:
            pass
        take_and_upload_screenshot(driver, f"10_after_continue_{i+1}", company_name)


def validate_required_fields(data, required_keys, entity_type="LLC"):
    """
    Validate that required keys exist and are non-empty in a data dict.
    Rejects placeholder values like 'N/A', '00000', empty strings.
    Raises ValueError with descriptive message on failure.
    """
    INVALID_VALUES = {"", "N/A", "n/a", "00000", "None", "null"}
    missing = []
    for key in required_keys:
        val = data
        for part in key.split("."):
            if isinstance(val, dict):
                val = val.get(part)
            else:
                val = None
                break
        if not val or str(val).strip() in INVALID_VALUES:
            missing.append(key)

    if missing:
        raise ValueError(
            f"{entity_type} filing validation failed — missing required fields: {', '.join(missing)}"
        )


def save_run_log(company_name, record_id, entity_type, extra_info=None):
    """Save a run log and upload to S3."""
    log_path = "run.log"
    with open(log_path, "w") as f:
        f.write(f"Company Name: {company_name}\n")
        f.write(f"Entity Type: {entity_type}\n")
        f.write(f"Airtable Record: {record_id}\n")
        f.write(f"Timestamp: {datetime.now().isoformat()}\n")
        if extra_info:
            f.write(f"Extra: {extra_info}\n")
    upload_file_to_s3(log_path, company_name.replace(" ", "_"), "logs")
