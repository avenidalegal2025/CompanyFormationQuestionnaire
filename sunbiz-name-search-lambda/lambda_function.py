"""
Sunbiz name-availability search.

search.sunbiz.org sits behind a Cloudflare bot challenge that rejects plain
HTTP clients (requests/urllib return 403 regardless of headers). A headless
Chromium with the automation fingerprint suppressed passes it, so this
function drives the real search form and scrapes the results table.

Returns the `existing_entities` array that /api/check-name-availability
expects; the route applies its own three-tier matching on top.
"""

import json
import logging
import os
import re
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SEARCH_URL = "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)

# Suppressing these is what actually gets past the challenge; without them the
# same browser is served a 403 interstitial.
# Lambda blocks the namespace syscalls Chromium's zygote/sandbox needs
# (sandbox/linux/services/credentials.cc: "Operation not permitted"), so the
# zygote and the setuid sandbox both have to go. Overridable via env for tuning.
DEFAULT_CHROMIUM_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--no-zygote",
    "--single-process",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-background-networking",
    "--disable-extensions",
]

CHROMIUM_ARGS = [
    a for a in (os.environ.get("CHROMIUM_ARGS", "").split(",")) if a.strip()
] or DEFAULT_CHROMIUM_ARGS

STEALTH_INIT = "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"

ENTITY_SUFFIXES = [
    "limited liability company", "limited liability co", "limited partnership",
    "incorporated", "corporation", "company", "limited", "llc", "l.l.c.",
    "inc", "corp", "ltd", "lp", "llp", "pa", "pllc", "co",
]

# Only these statuses need a detail-page fetch: the route blocks an inactive
# entity unless it can prove the dissolution is more than two years old.
INACTIVE_MARKERS = ("INACT", "INACTIVE")
MAX_DETAIL_FETCHES = 5



CHALLENGE_MARKERS = ("just a moment", "attention required", "checking your browser")


def wait_out_challenge(page, timeout_ms: int = 45000) -> str:
    """The interstitial clears itself once the JS challenge completes."""
    waited = 0
    title = page.title()
    while any(marker in title.lower() for marker in CHALLENGE_MARKERS):
        if waited >= timeout_ms:
            raise RuntimeError("Blocked by Cloudflare challenge: " + title)
        page.wait_for_timeout(2000)
        waited += 2000
        title = page.title()
    page.wait_for_timeout(1500)
    logger.info("Search page ready after %dms: %s", waited, title[:60])
    return title


def proxy_config():
    """Route through a residential proxy when configured.

    Cloudflare serves the challenge to AWS datacenter ranges no matter how
    convincing the browser looks, so from Lambda an exit IP with a residential
    reputation is required; leave the env vars unset to go direct.
    """
    server = os.environ.get("PROXY_SERVER", "").strip()
    if not server:
        return None
    config = {"server": server}
    username = os.environ.get("PROXY_USERNAME", "").strip()
    if username:
        config["username"] = username
        config["password"] = os.environ.get("PROXY_PASSWORD", "").strip()
    logger.info("Routing through proxy %s", server)
    return config


def strip_entity_suffix(name: str) -> str:
    cleaned = re.sub(r"[^\w\s]", " ", name.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    changed = True
    while changed:
        changed = False
        for suffix in ENTITY_SUFFIXES:
            if cleaned.endswith(" " + suffix):
                cleaned = cleaned[: -(len(suffix) + 1)].strip()
                changed = True
    return cleaned


def signature(name: str) -> str:
    """Collapse a name to letters and digits for close-match comparison."""
    return re.sub(r"[^a-z0-9]", "", strip_entity_suffix(name))


def parse_event_date(detail_text: str):
    """Pull 'Event Date Filed' (MM/DD/YYYY) out of a detail page."""
    for label in ("Event Date Filed", "Date Filed"):
        m = re.search(label + r"\s*\n?\s*(\d{2}/\d{2}/\d{4})", detail_text)
        if m:
            return m.group(1)
    return None


def search_sunbiz(company_name: str, entity_type: str) -> dict:
    search_term = strip_entity_suffix(company_name) or company_name.strip()
    input_signature = signature(company_name)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=CHROMIUM_ARGS, proxy=proxy_config())
        try:
            context = browser.new_context(
                user_agent=USER_AGENT,
                viewport={"width": 1440, "height": 900},
                locale="en-US",
            )
            context.add_init_script(STEALTH_INIT)
            page = context.new_page()

            logger.info("Opening Sunbiz search page")
            page.goto(SEARCH_URL, timeout=60000, wait_until="domcontentloaded")
            title = wait_out_challenge(page)

            logger.info("Searching for base name: %r (from %r)", search_term, company_name)
            page.fill("#SearchTerm", search_term)
            page.click('input[type="submit"]')
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(2500)

            rows = page.eval_on_selector_all(
                "table tbody tr",
                """rows => rows.map(tr => ({
                    cells: Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()),
                    href: tr.querySelector('a') ? tr.querySelector('a').getAttribute('href') : null
                }))""",
            )

            entities = []
            for row in rows:
                cells = row.get("cells") or []
                if len(cells) < 3 or not cells[0]:
                    continue
                entities.append({
                    "name": cells[0],
                    "documentNumber": cells[1],
                    "status": cells[2],
                    "detailUrl": urljoin(SEARCH_URL, row["href"]) if row.get("href") else None,
                })

            logger.info("Found %d result rows", len(entities))

            # An inactive entity with no date blocks by default in the route, so
            # fetch the dissolution date for the ones close enough to matter.
            fetched = 0
            for entity in entities:
                if fetched >= MAX_DETAIL_FETCHES:
                    break
                status = (entity["status"] or "").upper()
                if not any(marker in status for marker in INACTIVE_MARKERS):
                    continue
                if signature(entity["name"]) != input_signature:
                    continue
                if not entity["detailUrl"]:
                    continue
                try:
                    page.goto(entity["detailUrl"], timeout=45000, wait_until="domcontentloaded")
                    page.wait_for_timeout(1200)
                    event_date = parse_event_date(page.inner_text("body"))
                    if event_date:
                        entity["eventDateFiled"] = event_date
                    fetched += 1
                except Exception as exc:  # a missing date only costs us precision
                    logger.warning("Detail fetch failed for %s: %s", entity["name"], exc)

            for entity in entities:
                entity.pop("detailUrl", None)

            return {
                "success": True,
                "method": "playwright",
                "search_term": search_term,
                "entity_type": entity_type,
                "existing_entities": entities,
            }
        finally:
            browser.close()


def _extract_input(event):
    """Accept a direct Invoke payload or a Function URL / API Gateway request."""
    if isinstance(event, str):
        try:
            event = json.loads(event)
        except ValueError:
            return {}
    if not isinstance(event, dict):
        return {}
    if "companyName" not in event and isinstance(event.get("body"), str):
        try:
            body = json.loads(event["body"])
            if isinstance(body, dict):
                return body
        except ValueError:
            return {}
    return event


def lambda_handler(event, context):
    payload = _extract_input(event)
    company_name = (payload.get("companyName") or "").strip()
    entity_type = payload.get("entityType") or "LLC"

    if not company_name:
        return {"statusCode": 400, "body": json.dumps({"error": "Company name is required"})}

    try:
        result = search_sunbiz(company_name, entity_type)
        return {"statusCode": 200, "body": json.dumps(result)}
    except Exception as exc:
        logger.exception("Sunbiz search failed")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "success": False,
                "error": "Error checking availability: {}".format(exc),
            }),
        }
