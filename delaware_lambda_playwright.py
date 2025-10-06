#!/usr/bin/env python3
"""
Delaware Lambda with Playwright + 2captcha
Production-ready version for AWS Lambda deployment.
"""

import json
import time
import base64
import sys
import os
from typing import Optional, List, Dict, Any
import random

# For Lambda, we need to use the bundled Playwright
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    # Fallback for local development
    sys.path.append('/opt/python')
    from playwright.sync_api import sync_playwright

import requests

# Configuration
SCRAPEOPS_API_KEY = os.environ.get("SCRAPEOPS_API_KEY", "b3a2e586-8c39-4115-8ffb-590ad8750116")
# Force ScrapeOps mobile/residential aggregator proxy
PROXY_SERVER = os.environ.get("SCRAPEOPS_PROXY", "http://residential-proxy.scrapeops.io:8181")
PROXY_USERNAME = os.environ.get("SCRAPEOPS_USER", "scrapeops")
PROXY_PASSWORD = os.environ.get("SCRAPEOPS_PASSWORD", SCRAPEOPS_API_KEY)

CAPTCHA_API_KEY = os.environ.get("TWO_CAPTCHA_API_KEY", "f70e8ca44204cc56c23f32925064ee93")
CAPTCHA_SOLVE_URL = "http://2captcha.com/in.php"
CAPTCHA_RESULT_URL = "http://2captcha.com/res.php"

SEARCH_URL = "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx"
MOBILE_DEVICES = [
    "iPhone 13",
    "Pixel 7",
    "iPad Mini",
]

# Name normalization functions (from name_check.py)
import re
import unicodedata

GENERIC_WORDS = {
    "corp", "corporation", "inc", "incorporated",
    "llc", "limited", "limited liability company", "limited liability co", "co", "company", "lc", "ltd", "ltd.", "ltd",
    "limited partnership", "lp", "partnership",
    "statutory trust", "trust", "foundation",
    "l3c", "dao", "lao",
    "the", "and", "&",
}

PUNCTUATION_PATTERN = re.compile(r"[^\w\s]")
SING_PLUR_EQUIV = {
    "property": "properties", "child": "children", "holding": "holdings",
    "supernova": "supernovae", "maximum": "maxima", "goose": "geese",
    "cactus": "cacti", "spectrum": "spectra", "lumen": "lumina",
}
ROMAN_NUMERAL_PATTERN = re.compile(r"\b[IVXLCDM]+\b", re.IGNORECASE)

def normalize_tokens(name: str) -> List[str]:
    """Normalize company name tokens for comparison"""
    normalized = unicodedata.normalize('NFD', name.lower())
    normalized = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    normalized = PUNCTUATION_PATTERN.sub(' ', normalized)
    tokens = normalized.split()
    tokens = [token for token in tokens if token not in GENERIC_WORDS]
    
    processed_tokens = []
    for token in tokens:
        if token in SING_PLUR_EQUIV:
            processed_tokens.append(SING_PLUR_EQUIV[token])
        else:
            processed_tokens.append(token)
    
    return processed_tokens

def comparable_signature(name: str) -> str:
    """Create a comparable signature from a company name"""
    tokens = normalize_tokens(name)
    tokens.sort()
    signature = ' '.join(tokens)
    
    def replace_roman(match):
        roman = match.group().upper()
        roman_to_num = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
        num = 0
        prev = 0
        for char in reversed(roman):
            val = roman_to_num[char]
            if val < prev:
                num -= val
            else:
                num += val
            prev = val
        return str(num)
    
    signature = ROMAN_NUMERAL_PATTERN.sub(replace_roman, signature)
    return signature

def extract_base_name(company_name: str) -> str:
    """Extract the base name from a company name for comparison"""
    suffixes = ['corp', 'corporation', 'inc', 'incorporated', 'llc', 'limited', 'ltd', 'co', 'company']
    name = company_name.lower().strip()
    
    for suffix in suffixes:
        if name.endswith(' ' + suffix):
            name = name[:-len(' ' + suffix)].strip()
        elif name.endswith(suffix):
            name = name[:-len(suffix)].strip()
    
    return name.strip()

def solve_captcha_image_bytes(image_bytes: bytes) -> Optional[str]:
    """Solve CAPTCHA using 2captcha service"""
    try:
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        data = {"key": CAPTCHA_API_KEY, "method": "base64", "body": encoded}
        r = requests.post(CAPTCHA_SOLVE_URL, data=data, timeout=45)
        r.raise_for_status()
        if not r.text.startswith("OK|"):
            return None
        captcha_id = r.text.split("|", 1)[1]
        
        # Poll for result
        for _ in range(24):  # up to ~2 minutes
            time.sleep(5)
            rr = requests.get(CAPTCHA_RESULT_URL, params={
                "key": CAPTCHA_API_KEY, 
                "action": "get", 
                "id": captcha_id
            }, timeout=30)
            rr.raise_for_status()
            if rr.text == "CAPCHA_NOT_READY":
                continue
            if rr.text.startswith("OK|"):
                return rr.text.split("|", 1)[1]
            return None
        return None
    except Exception:
        return None

def check_delaware_availability(company_name: str, entity_type: str = "LLC") -> Dict[str, Any]:
    """Check if a company name is available in Delaware using Playwright"""
    
    def run_once(pre_wait_ms: int = 0, preferred_device: Optional[str] = None) -> Dict[str, Any]:
        with sync_playwright() as p:
            # Randomize mobile device for better stealth
            device_name = preferred_device if preferred_device in MOBILE_DEVICES else random.choice(MOBILE_DEVICES)
            device = p.devices.get(device_name)
            launch_args = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--single-process",
            ]
            browser = p.chromium.launch(
                headless=True,
                proxy={
                    "server": PROXY_SERVER,
                    "username": PROXY_USERNAME,
                    "password": PROXY_PASSWORD,
                },
                args=launch_args,
            )
            context = browser.new_context(
                **device,
                ignore_https_errors=True,
                locale="en-US",
                extra_http_headers={
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                    "Upgrade-Insecure-Requests": "1",
                },
            )
            page = context.new_page()
            
            # Go to search page
            page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=90000)
            # Human-like delay after load
            dwell = pre_wait_ms if pre_wait_ms > 0 else random.randint(10000, 15000)
            page.wait_for_timeout(dwell)
            
            # Check for blocking
            content_lower = page.content().lower()
            if "blocked" in content_lower:
                return {
                    'success': False,
                    'available': False,
                    'message': 'Access blocked by Delaware website',
                    'method': 'delaware_playwright',
                    'existing_entities': []
                }
            
            # Wait for either input or CAPTCHA area to appear
            try:
                page.wait_for_selector(
                    "input[name='ctl00$ContentPlaceHolder1$frmEntityName'], #ctl00_ContentPlaceHolder1_captchaDiv",
                    timeout=45000,
                )
            except Exception:
                return {
                    'success': False,
                    'available': False,
                    'message': 'Search form or CAPTCHA not visible',
                    'method': 'delaware_playwright',
                    'existing_entities': []
                }

            # Handle CAPTCHA if present
            captcha_text = None
            try:
                captcha_div = page.query_selector('#ctl00_ContentPlaceHolder1_captchaDiv')
            except Exception:
                captcha_div = None

            if captcha_div:
                try:
                    captcha_div.scroll_into_view_if_needed()
                except Exception:
                    pass

                # Try multiple possible captcha image selectors
                captcha_img = None
                for sel in [
                    "#ctl00_ContentPlaceHolder1_imgCaptcha",
                    "#ctl00_ContentPlaceHolder1_CaptchaImage",
                    "#ctl00_ContentPlaceHolder1_captchaImage",
                    "img[id*='Captcha']",
                ]:
                    try:
                        el = page.query_selector(sel)
                        if el:
                            captcha_img = el
                            break
                    except Exception:
                        continue

                if captcha_img:
                    try:
                        image_bytes = captcha_img.screenshot()
                        captcha_text = solve_captcha_image_bytes(image_bytes)
                        if captcha_text:
                            try:
                                page.fill("input[name='ctl00$ContentPlaceHolder1$txtCaptcha']", captcha_text)
                                page.wait_for_timeout(random.randint(800, 1400))
                            except Exception:
                                pass
                    except Exception:
                        pass
            
            # Fill search input
            search_term = extract_base_name(company_name)
            try:
                # Ensure input is visible; scroll if needed
                page.wait_for_selector("input[name='ctl00$ContentPlaceHolder1$frmEntityName']", timeout=30000, state='visible')
                input_el = page.query_selector("input[name='ctl00$ContentPlaceHolder1$frmEntityName']")
                if input_el:
                    try:
                        input_el.scroll_into_view_if_needed()
                        page.mouse.move(20 + random.randint(0, 60), 200 + random.randint(0, 60))
                        page.wait_for_timeout(random.randint(400, 900))
                    except Exception:
                        pass
                page.fill("input[name='ctl00$ContentPlaceHolder1$frmEntityName']", search_term)
                # Longer dwell before submit to appear human
                page.wait_for_timeout(random.randint(5000, 9000))
            except Exception:
                # Debug: dump a snippet of current HTML to logs for troubleshooting
                try:
                    html_snippet = page.content()
                    if html_snippet:
                        print("[DEBUG] PAGE HTML SNIPPET (first 50000 chars):\n" + html_snippet[:50000])
                except Exception:
                    pass
                return {
                    'success': False,
                    'available': False,
                    'message': 'Could not find search input field',
                    'method': 'delaware_playwright',
                    'existing_entities': []
                }
            
            # Fill captcha if solved
            if captcha_text:
                try:
                    page.fill("input[name='ctl00$ContentPlaceHolder1$txtCaptcha']", captcha_text)
                except Exception:
                    pass
            
            # Submit form
            try:
                page.click("input[name='ctl00$ContentPlaceHolder1$btnSubmit']", timeout=30000)
                page.wait_for_timeout(random.randint(1500, 3000))
            except Exception:
                try:
                    page.press("input[name='ctl00$ContentPlaceHolder1$frmEntityName']", "Enter")
                except Exception:
                    return {
                        'success': False,
                        'available': False,
                        'message': 'Could not submit the form',
                        'method': 'delaware_playwright',
                        'existing_entities': []
                    }
            
            page.wait_for_load_state("domcontentloaded", timeout=90000)
            
            # Check for blocking after submit
            html = page.content()
            lower = html.lower()
            if "blocked" in lower:
                return {
                    'success': False,
                    'available': False,
                    'message': 'Access blocked after form submission',
                    'method': 'delaware_playwright',
                    'existing_entities': []
                }
            
            # Check for no results
            if any(phrase in lower for phrase in [
                "no records found", "no results found", "no entities found", 
                "no matches found", "search returned no results"
            ]):
                return {
                    'success': True,
                    'available': True,
                    'message': 'Nombre disponible en Delaware',
                    'method': 'delaware_playwright',
                    'existing_entities': []
                }
            
            # Parse results table
            try:
                rows = page.query_selector_all("#tblResults tr")
                if not rows or len(rows) <= 1:
                    return {
                        'success': True,
                        'available': True,
                        'message': 'Nombre disponible en Delaware',
                        'method': 'delaware_playwright',
                        'existing_entities': []
                    }
                
                # Check for exact matches
                exact_matches = []
                input_signature = extract_base_name(company_name)
                
                for row in rows[1:]:  # Skip header
                    cells = row.query_selector_all("td")
                    if len(cells) >= 2:
                        file_number = cells[0].inner_text().strip()
                        corporate_name = cells[1].inner_text().strip()
                        
                        corporate_signature = extract_base_name(corporate_name)
                        if corporate_signature == input_signature and corporate_signature != "":
                            exact_matches.append({
                                'name': corporate_name,
                                'status': 'ACTIVE',
                                'signature': corporate_signature
                            })
                
                if exact_matches:
                    return {
                        "success": True,
                        "available": False,
                        "message": "Nombre no disponible en Delaware, intenta otro.",
                        "method": "delaware_playwright",
                        "existing_entities": [{"name": m["name"], "status": m["status"]} for m in exact_matches]
                    }
                else:
                    return {
                        "success": True,
                        "available": True,
                        "message": "Nombre disponible en Delaware",
                        "method": "delaware_playwright",
                        "existing_entities": []
                    }
                    
            except Exception as e:
                return {
                    'success': False,
                    'available': False,
                    'message': f'Error parsing results: {str(e)}',
                    'method': 'delaware_playwright',
                    'existing_entities': []
                }
            
            finally:
                try:
                    context.close()
                except Exception:
                    pass
                try:
                    browser.close()
                except Exception:
                    pass
    # Single retry if browser/page closed unexpectedly
    try:
        # First attempt with long dwell
        return run_once()
    except Exception as e:
        msg = str(e)
        if "has been closed" in msg or "BrowserContext" in msg or "Target page" in msg:
            # Wait and retry once with different device and longer dwell
            time.sleep(random.randint(20, 30))
            try:
                # pick a different device
                alt_devices = [d for d in MOBILE_DEVICES]
                random.shuffle(alt_devices)
                preferred = alt_devices[0]
                return run_once(pre_wait_ms=random.randint(12000, 18000), preferred_device=preferred)
            except Exception as e2:
                return {
                    'success': False,
                    'available': False,
                    'message': f'Error checking Delaware availability (retry): {str(e2)}',
                    'method': 'delaware_playwright',
                    'existing_entities': []
                }
        return {
            'success': False,
            'available': False,
            'message': f'Error checking Delaware availability: {str(e)}',
            'method': 'delaware_playwright',
            'existing_entities': []
        }

def lambda_handler(event, context):
    """Lambda handler for Delaware name search with Playwright"""
    
    try:
        # Extract parameters
        company_name = event.get('companyName', '')
        entity_type = event.get('entityType', 'LLC')
        
        if not company_name:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'success': False,
                    'available': False,
                    'message': 'Company name is required',
                    'method': 'delaware_playwright',
                    'existing_entities': []
                })
            }
        
        # Check availability
        result = check_delaware_availability(company_name, entity_type)
        
        return {
            'statusCode': 200,
            'body': json.dumps(result)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'available': False,
                'message': f'Lambda error: {str(e)}',
                'method': 'delaware_playwright',
                'existing_entities': []
            })
        }

# Test function
if __name__ == "__main__":
    test_event = {
        'companyName': 'Google LLC',
        'entityType': 'LLC'
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))
