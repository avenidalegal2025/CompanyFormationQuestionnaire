#!/usr/bin/env python3
"""
One-off Playwright run: Google LLC on Delaware with mobile proxy + 2captcha.
"""

import asyncio
import time
import base64
import io
import json
import sys
from typing import Optional

import requests
from playwright.sync_api import sync_playwright
try:
    from playwright_stealth import stealth_sync
except Exception:
    stealth_sync = None

SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
PROXY_SERVER = "http://residential-proxy.scrapeops.io:8181"  # ScrapeOps Residential & Mobile Proxy Aggregator
PROXY_USERNAME = "scrapeops"
PROXY_PASSWORD = SCRAPEOPS_API_KEY

CAPTCHA_API_KEY = "f70e8ca44204cc56c23f32925064ee93"
CAPTCHA_SOLVE_URL = "http://2captcha.com/in.php"
CAPTCHA_RESULT_URL = "http://2captcha.com/res.php"

SEARCH_URL = "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx"
TARGET_NAME = "Google LLC"

MOBILE_DEVICE = "iPhone 13"


def solve_captcha_image_bytes(image_bytes: bytes) -> Optional[str]:
    try:
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        data = {"key": CAPTCHA_API_KEY, "method": "base64", "body": encoded}
        r = requests.post(CAPTCHA_SOLVE_URL, data=data, timeout=45)
        r.raise_for_status()
        if not r.text.startswith("OK|"):
            return None
        captcha_id = r.text.split("|", 1)[1]
        # poll for result
        for _ in range(24):  # up to ~2 minutes
            time.sleep(5)
            rr = requests.get(CAPTCHA_RESULT_URL, params={"key": CAPTCHA_API_KEY, "action": "get", "id": captcha_id}, timeout=30)
            rr.raise_for_status()
            if rr.text == "CAPCHA_NOT_READY":
                continue
            if rr.text.startswith("OK|"):
                return rr.text.split("|", 1)[1]
            return None
        return None
    except Exception:
        return None


def run_once():
    print("🚀 Playwright one-off: Google LLC (mobile proxy + 2captcha)")
    with sync_playwright() as p:
        iphone = p.devices.get(MOBILE_DEVICE)
        browser = p.chromium.launch(headless=True, proxy={
            "server": PROXY_SERVER,
            "username": PROXY_USERNAME,
            "password": PROXY_PASSWORD,
        })
        context = browser.new_context(**iphone, ignore_https_errors=True)
        page = context.new_page()
        if stealth_sync:
            stealth_sync(page)

        # Go to search page
        page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=60000)
        content_lower = page.content().lower()
        if "blocked" in content_lower:
            print("🚫 Initial page indicates blocked")
        if "captcha" in content_lower:
            print("🧩 CAPTCHA detected on initial page")

        # If captcha panel exists, try to solve
        captcha_img = None
        for sel in [
            "#ctl00_ContentPlaceHolder1_imgCaptcha",
            "#ctl00_ContentPlaceHolder1_CaptchaImage",
            "#ctl00_ContentPlaceHolder1_captchaImage",
        ]:
            try:
                el = page.query_selector(sel)
                if el:
                    captcha_img = el
                    break
            except Exception:
                pass

        captcha_text = None
        if captcha_img:
            try:
                image_bytes = captcha_img.screenshot()
                print("🧩 Solving CAPTCHA via 2captcha...")
                captcha_text = solve_captcha_image_bytes(image_bytes)
                print(f"   CAPTCHA solution: {captcha_text}")
            except Exception:
                pass

        # Fill search input
        # Input name: ctl00$ContentPlaceHolder1$frmEntityName
        try:
            page.fill("input[name='ctl00$ContentPlaceHolder1$frmEntityName']", TARGET_NAME.replace(" LLC", ""))
        except Exception:
            print("❌ Could not find search input field")

        # Fill captcha if solved
        if captcha_text:
            try:
                page.fill("input[name='ctl00$ContentPlaceHolder1$txtCaptcha']", captcha_text)
            except Exception:
                print("⚠️ Could not fill CAPTCHA input field")

        # Submit form (button name ctl00$ContentPlaceHolder1$btnSubmit)
        try:
            page.click("input[name='ctl00$ContentPlaceHolder1$btnSubmit']", timeout=30000)
        except Exception:
            # try pressing Enter inside the search input
            try:
                page.press("input[name='ctl00$ContentPlaceHolder1$frmEntityName']", "Enter")
            except Exception:
                print("❌ Could not submit the form")

        page.wait_for_load_state("domcontentloaded", timeout=60000)
        html = page.content()
        lower = html.lower()
        if "blocked" in lower:
            print("🚫 Blocked status detected after submit")
        if any(phrase in lower for phrase in [
            "no records found", "no results found", "no entities found", "no matches found", "search returned no results"
        ]):
            print("✅ No results phrases detected (appears available)")

        # Parse results table
        try:
            rows = page.query_selector_all("#tblResults tr")
            if not rows:
                print("⚠️ No results table found")
            else:
                print(f"📋 Results rows: {len(rows)}")
                if len(rows) <= 1:
                    print("⚠️ Only header row present (likely blocked or empty)")
                else:
                    for i, row in enumerate(rows[1:], start=1):
                        cells = row.query_selector_all("td")
                        if len(cells) >= 2:
                            file_num = cells[0].inner_text().strip()
                            name = cells[1].inner_text().strip()
                            print(f"  {i}. {file_num} - {name}")
        except Exception:
            print("⚠️ Could not parse results table")

        context.close()
        browser.close()


if __name__ == "__main__":
    run_once()
