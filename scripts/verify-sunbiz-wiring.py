#!/usr/bin/env python3
"""
Sunbiz auto-filing wiring verifier (dry-run only — never files anything, never
writes to Airtable, never prints secrets).

For a given Airtable Formations record id (or a built-in self-test fixture):
  a) pulls the record and asserts every field the EC2 watcher / filing scripts
     require is present, non-empty and plausible (formats, state codes,
     ownership-% sums, manager/officer coverage);
  b) flags any value that equals a known hardcoded default from the filing path
     (see HARDCODED_DEFAULTS below — sourced from filing_utils.py,
     llc_filing_airtable.py, corp_filing_airtable.py);
  c) checks the EC2 filing watcher is actually alive: instance state, SSM agent
     ping, systemd service state (read-only `systemctl is-active` via SSM
     SendCommand), last journal activity, and age of the newest object in the
     S3 audit bucket;
  d) prints a clear PASS/FAIL wiring report.

Usage:
  python3 scripts/verify-sunbiz-wiring.py --record recXXXXXXXXXXXXXX
  python3 scripts/verify-sunbiz-wiring.py --selftest
  python3 scripts/verify-sunbiz-wiring.py --record recXXX --skip-aws

Reads AIRTABLE_API_KEY / AIRTABLE_BASE_ID / AIRTABLE_TABLE_NAME and
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from .env.local (never printed).
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --------------------------------------------------------------------------
# Known hardcoded values in the filing path (file:line references as of the
# repo state verified 2026-09-23). If the filing code changes, update these.
# --------------------------------------------------------------------------
AVENIDA_ADDRESS = {  # filing_utils.py:34-41  (AVENIDA_LEGAL_ADDRESS)
    "line1": "12550 Biscayne Blvd",
    "line2": "Ste 110",
    "city": "North Miami",
    "state": "FL",
    "zip": "33181",
}
AVENIDA_ADDRESS_ONELINE = "12550 Biscayne Blvd Ste 110, North Miami, FL 33181"  # src/lib/virtual-office.ts:14-24 (VIRTUAL_OFFICE defaults)
RA_DEFAULT_FIRST = "JOHN"   # filing_utils.py:45 (env RA_FIRST_NAME, unset on EC2)
RA_DEFAULT_LAST = "DOE"     # filing_utils.py:46 (env RA_LAST_NAME, unset on EC2)
LLC_TITLE_DEFAULT = "MGR"   # llc_filing_airtable.py — authorized-person title (locked decision)
CORP_SHARES_DEFAULT = "1000"        # corp_filing_airtable.py (logged as DEFAULT_IN_USED)
CORP_TITLE_DEFAULT = "D"            # corp_filing_airtable.py (logged as DEFAULT_IN_USED)
LLC_PURPOSE_DEFAULT = "Any lawful purpose"            # llc_filing_airtable.py:172
CORP_PURPOSE_DEFAULT = "Any and all lawful business"  # corp_filing_airtable.py:286

WATCHER_INSTANCE_ID = "i-0764ed6c3bda7a5c2"  # tag Name=LLC-Filing-Automation, us-west-1
WATCHER_REGION = "us-west-1"
WATCHER_SERVICE = "autofill-watcher"
AUDIT_BUCKET = "llc-filing-audit-trail-rodolfo"  # filing_utils.py:29
PAYMENT_PARAM = "/llc/payment"                   # filing_utils.py:138

US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
}

# --------------------------------------------------------------------------
# Results collector
# --------------------------------------------------------------------------
class Report:
    def __init__(self):
        self.items = []  # (status, label, detail)

    def ok(self, label, detail=""):
        self.items.append(("PASS", label, detail))

    def warn(self, label, detail=""):
        self.items.append(("WARN", label, detail))

    def fail(self, label, detail=""):
        self.items.append(("FAIL", label, detail))

    def info(self, label, detail=""):
        self.items.append(("INFO", label, detail))

    @property
    def failed(self):
        return sum(1 for s, _, _ in self.items if s == "FAIL")

    @property
    def warned(self):
        return sum(1 for s, _, _ in self.items if s == "WARN")

    def render(self):
        icon = {"PASS": "\u2705", "FAIL": "\u274c", "WARN": "\u26a0\ufe0f ", "INFO": "\u2139\ufe0f "}
        lines = []
        for status, label, detail in self.items:
            line = f"  {icon[status]} [{status}] {label}"
            if detail:
                line += f" — {detail}"
            lines.append(line)
        lines.append("")
        lines.append(f"  Result: {self.failed} FAIL, {self.warned} WARN, "
                     f"{sum(1 for s,_,_ in self.items if s=='PASS')} PASS")
        lines.append("  " + ("\u274c WIRING NOT SAFE FOR LIVE FILING"
                             if self.failed else
                             "\u2705 NO BLOCKING ISSUES (review warnings)"))
        return "\n".join(lines)


# --------------------------------------------------------------------------
# Config / access helpers (secrets are read but never printed)
# --------------------------------------------------------------------------
def load_env(path):
    env = {}
    if not os.path.exists(path):
        return env
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def airtable_get(env, record_id):
    key = env.get("AIRTABLE_API_KEY")
    base = env.get("AIRTABLE_BASE_ID")
    table = env.get("AIRTABLE_TABLE_NAME", "Formations")
    if not key or not base:
        raise RuntimeError("AIRTABLE_API_KEY / AIRTABLE_BASE_ID missing from .env.local")
    url = (f"https://api.airtable.com/v0/{base}/"
           f"{urllib.parse.quote(table)}/{record_id}")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


# --------------------------------------------------------------------------
# Address parsing — mirrors filing_utils.py:175-260 (parse_address) closely
# enough to predict what the filer will extract / fall back to.
# --------------------------------------------------------------------------
INTL_KEYWORDS = [
    "united kingdom", "england", "scotland", "wales", "london", "manchester",
    "canada", "toronto", "vancouver", "montreal", "ontario", "quebec",
    "mexico", "méxico", "guadalajara", "monterrey",
    "france", "paris", "germany", "berlin", "spain", "madrid",
    "italy", "rome", "australia", "sydney", "new zealand", "auckland",
]


def parse_address_like_filer(address_str):
    """Same split logic as filing_utils.parse_address (US branch + intl detect)."""
    if not address_str:
        return {}
    lowered = address_str.lower()
    if any(kw in lowered for kw in INTL_KEYWORDS):
        return {"line1": address_str.split(",")[0].strip(), "country": "INT"}
    sections = [s.strip() for s in address_str.split(",")]
    parts = {}
    if len(sections) >= 3:
        parts["line1"] = sections[0]
        parts["city"] = sections[1]
        state_zip = sections[2].split()
        parts["state"] = state_zip[0] if state_zip else ""
        parts["zip"] = state_zip[1] if len(state_zip) >= 2 else ""
    elif len(sections) == 2:
        parts["line1"] = sections[0]
        csz = sections[1].split()
        if len(csz) >= 3:
            parts["city"] = " ".join(csz[:-2])
            parts["state"] = csz[-2]
            parts["zip"] = csz[-1]
        else:
            parts["city"] = sections[1]
            parts["state"] = ""
            parts["zip"] = ""
    else:
        parts = {"line1": address_str, "city": "", "state": "", "zip": ""}
    parts["country"] = "US"
    return parts


def addr_is_complete(p):
    return bool(p) and all(p.get(k) for k in ("line1", "city", "state", "zip")) \
        and p.get("country") != "INT"


def is_avenida_addr(text):
    return bool(text) and "12550 Biscayne" in text


# --------------------------------------------------------------------------
# (a)+(b) record validation
# --------------------------------------------------------------------------
def validate_record(rep, record):
    fields = record.get("fields", {})
    rid = record.get("id", "?")
    rep.info("Record", f"{rid} — {fields.get('Company Name', '?')} "
                       f"({fields.get('Entity Type', '?')}, {fields.get('Formation State', '?')})")

    entity = fields.get("Entity Type", "")
    state = fields.get("Formation State", "")
    status = fields.get("Formation Status", "")
    autofill = fields.get("Autofill", "")

    # --- Gate fields the watcher formula requires (autofill_watcher.py:46-61) ---
    if state == "Florida":
        rep.ok("Formation State = Florida", "watcher will consider this record")
    else:
        rep.fail("Formation State", f"'{state}' — watcher only files Florida "
                 f"(filing_dispatcher.py:36-40)")

    if fields.get("Stripe Payment ID"):
        rep.ok("Stripe Payment ID present")
    else:
        rep.fail("Stripe Payment ID", "empty — watcher formula requires payment")

    if entity in ("LLC", "C-Corp", "S-Corp"):
        rep.ok(f"Entity Type = {entity}", "supported by dispatcher")
    else:
        rep.fail("Entity Type", f"'{entity}' — dispatcher supports LLC/C-Corp/S-Corp only")

    if status in ("Pending", "In Progress"):
        rep.ok(f"Formation Status = {status}", "eligible for watcher pickup")
    else:
        rep.warn("Formation Status", f"'{status}' — watcher only picks up Pending/In Progress")

    if autofill == "Yes":
        rep.ok("Autofill = Yes", "armed for the watcher")
    else:
        rep.fail("Autofill flag", f"'{autofill or 'EMPTY'}' — webhook should set 'Yes' "
                 f"(route.ts:1171-1181); watcher will IGNORE this record until then")

    # --- Company name ---
    name = fields.get("Company Name", "")
    if name and name != "Unknown Company":
        rep.ok("Company Name", name)
        if entity == "LLC" and "LLC" not in name.upper() and "L.L.C" not in name.upper():
            rep.warn("LLC suffix", "name has no LLC suffix — Sunbiz may reject")
    else:
        rep.fail("Company Name", f"'{name or 'EMPTY'}'")

    # --- Customer email (return contact, llc_filing_airtable.py:204-207) ---
    email = fields.get("Customer Email", "")
    if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email or ""):
        rep.ok("Customer Email format", email)
    else:
        rep.fail("Customer Email", f"'{email or 'EMPTY'}' — used as Sunbiz correspondence email")

    # --- Principal address (falls back to Avenida Legal address) ---
    comp_addr = fields.get("Company Address", "")
    pa = parse_address_like_filer(comp_addr)
    if addr_is_complete(pa):
        if pa.get("state") not in US_STATES:
            rep.fail("Company Address state", f"'{pa.get('state')}' not a US state code")
        else:
            rep.ok("Company Address parseable", f"{pa['line1']}, {pa['city']}, {pa['state']} {pa['zip']}")
    elif is_avenida_addr(comp_addr):
        if fields.get("Virtual Office Used") == "Yes":
            rep.ok("Company Address = virtual office (flagged)",
                   f"'{comp_addr}' — client had no US address; Airtable stores the Avenida "
                   f"virtual office (src/lib/airtable.ts) and 'Virtual Office Used' = Yes "
                   f"makes the substitution visible. Filed as the PRINCIPAL address on Sunbiz.")
        else:
            rep.warn("Company Address = virtual office (UNFLAGGED)",
                     f"'{comp_addr}' — client had no US address; Airtable stores the Avenida "
                     f"virtual office, but 'Virtual Office Used' is not 'Yes' on the record. "
                     f"The app now writes this flag (mapQuestionnaireToAirtable); make sure "
                     f"the Airtable field exists (scripts/add-sunbiz-autofile-fields.ts).")
    else:
        rep.fail("Company Address not parseable",
                 f"'{comp_addr or 'EMPTY'}' — filer marks the record 'Needs Review' and SKIPS "
                 f"FILING (flag_needs_review); the Avenida Legal address is never substituted.")

    # --- Business purpose (translated via OpenAI only if OPENAI_API_KEY set on EC2) ---
    purpose = fields.get("Business Purpose", "")
    if purpose:
        if re.search(r"[áéíóúñ]|RESTAURANTE|NEGOCIO|SERVICIOS", purpose, re.I) and \
           not re.search(r"[a-z]", purpose.replace("RESTAURANTE", "")):
            pass  # generic check below handles language
        if re.search(r"[A-ZÁÉÍÓÚÑ]{4,}", purpose) and purpose.isupper() and \
           any(w in purpose.upper() for w in
               ("RESTAURANTE", "NEGOCIO", "SERVICIO", "VENTA", "CONSULTORIA", "COMERCIO")):
            rep.warn("Business Purpose language",
                     f"'{purpose}' looks Spanish — if OpenAI translation fails the filer "
                     f"now refuses to file (Needs Review) instead of filing it as-is "
                     f"(2026-09-24: OpenAI account had zero credits; verify balance before demo)")
        else:
            rep.ok("Business Purpose", purpose[:80])
    else:
        dflt = LLC_PURPOSE_DEFAULT if entity == "LLC" else CORP_PURPOSE_DEFAULT
        rep.warn("Business Purpose empty", f"filer will use hardcoded default '{dflt}'")

    # --- Registered Agent ---
    # The live check runs in check_watcher() (it sources the env on the EC2 and
    # reads what filing_utils will actually use). Static code defaults are
    # placeholders by design; env overrides on the instance decide the gate.
    rep.info("Registered Agent", "live value checked in the watcher section below")

    # --- Payment (structural: single shared card in SSM) ---
    rep.warn("Payment source",
             f"all filings charge the single shared card in SSM {PAYMENT_PARAM} "
             f"(filing_utils.py:135-149) — verify the card is current before demo")

    # --- Entity-specific ---
    if entity == "LLC":
        _validate_llc(rep, fields)
    elif entity in ("C-Corp", "S-Corp"):
        _validate_corp(rep, fields)

    return fields


def _ownership_sum(rep, fields):
    total = 0.0
    n = 0
    for i in range(1, 7):
        v = fields.get(f"Owner {i} Ownership %")
        if isinstance(v, (int, float)):
            total += v
            n += 1
    if n == 0:
        rep.warn("Ownership %", "no Owner N Ownership % values found")
    elif abs(total - 1.0) > 0.005:
        rep.fail("Ownership % sum", f"{n} owners sum to {total:.4f} (Airtable stores "
                 f"fractions; expected ~1.0 = 100%)")
    else:
        rep.ok("Ownership % sum", f"{n} owners, sum = {total:.4f}")


def _validate_llc(rep, fields):
    # Mirror the filer's loop (llc_filing_airtable.py:_extract_managers_from_airtable):
    # EVERY populated Manager 1..6 slot is filed as an authorized person (MGR).
    managers = []
    for i in range(1, 7):
        first = fields.get(f"Manager {i} First Name", "")
        last = fields.get(f"Manager {i} Last Name", "")
        name = fields.get(f"Manager {i} Name", "")
        addr = fields.get(f"Manager {i} Address", "")
        if not (first or last) and name:
            parts = name.split()
            first, last = parts[0], " ".join(parts[1:])
        if first or last or name:
            managers.append((i, name or f"{first} {last}".strip(), addr))

    if not managers:
        # fallback to Owner 1 (llc_filing_airtable.py — only when no manager slots)
        o_first = fields.get("Owner 1 First Name", "")
        o_last = fields.get("Owner 1 Last Name", "")
        o_name = fields.get("Owner 1 Name", "")
        if o_first or o_last or o_name:
            rep.warn("No Manager slots populated", "filer falls back to Owner 1 as the only authorized person")
            managers.append((1, o_name or f"{o_first} {o_last}".strip(),
                             fields.get("Owner 1 Address", "")))
        else:
            rep.fail("Manager/authorized person", "no Manager 1..6 AND no Owner 1 — filer "
                     "marks the record 'Needs Review' and skips filing")
            return
    else:
        rep.ok(f"Managers to file: {len(managers)}",
               "every Manager N on the record is entered as an authorized person (title MGR): "
               + ", ".join(m[1] for m in managers))

    # Cross-check against Managers Count if present
    managers_count = fields.get("Managers Count", 0) or 0
    if managers_count and int(managers_count) != len(managers):
        rep.warn("Managers Count mismatch",
                 f"Managers Count = {managers_count} but {len(managers)} populated "
                 f"Manager slot(s) found — filer uses the populated slots")

    for i, mname, maddr in managers:
        ma = parse_address_like_filer(maddr)
        if not (maddr or "").strip():
            rep.info(f"Manager {i} address empty",
                     f"{mname} — filer falls back to the principal address (client's own data)")
        elif addr_is_complete(ma):
            st = ma.get("state")
            if st not in US_STATES:
                rep.warn(f"Manager {i} address state", f"'{st}' — filer files it as-is")
            rep.ok(f"Manager {i} address parseable", f"{ma['line1']}, {ma['city']}, {ma['state']} {ma['zip']}")
        elif ma.get("country") == "INT":
            rep.info(f"Manager {i} address international", f"{mname} — filed as-is (no invented state/zip)")
        else:
            rep.fail(f"Manager {i} address incomplete",
                     f"'{maddr}' ({mname}) — filer marks the record 'Needs Review' and SKIPS "
                     f"FILING rather than inventing state/zip")

    rep.info("Authorized-person title", f"'{LLC_TITLE_DEFAULT}' (member-manager) for every "
             "manager — locked decision, not a silent default")
    _ownership_sum(rep, fields)


def _validate_corp(rep, fields):
    shares = fields.get("Number of Shares")
    if shares:
        rep.ok("Number of Shares", str(shares))
    else:
        rep.warn("Number of Shares", f"empty — filer defaults to {CORP_SHARES_DEFAULT} but "
                 f"logs DEFAULT_IN_USED:Number of Shares and appends it to the record's Notes")

    people = 0
    for i in range(1, 7):
        if fields.get(f"Officer {i} First Name") or fields.get(f"Officer {i} Last Name") \
           or fields.get(f"Officer {i} Name"):
            people += 1
            role = fields.get(f"Officer {i} Role", "")
            if not role:
                rep.warn(f"Officer {i} role", f"missing — filed as '{CORP_TITLE_DEFAULT}' "
                         f"(Director); logged as DEFAULT_IN_USED:Officer Role and noted on the record")
            addr = fields.get(f"Officer {i} Address", "")
            if (addr or "").strip():
                pa = parse_address_like_filer(addr)
                if pa.get("country") != "INT" and pa.get("line1") and not (pa.get("state") and pa.get("zip")):
                    rep.fail(f"Officer {i} address incomplete",
                             f"'{addr}' — filer marks the record 'Needs Review' and SKIPS "
                             f"FILING rather than inventing state/zip")
        elif fields.get(f"Director {i} First Name") or fields.get(f"Director {i} Last Name") \
                or fields.get(f"Director {i} Name"):
            people += 1
    if people == 0:
        rep.fail("Officers/Directors", "none found — corp filer aborts with "
                 "'requires at least one officer or director' (corp_filing_airtable.py)")
    else:
        rep.ok("Officers/Directors", f"{people} slot(s) populated (max 6 filed)")

    name = fields.get("Company Name", "")
    if name and not any(s.upper() in name.upper() for s in
                        ("CORP", "CORPORATION", "INC", "INCORPORATED", "COMPANY", "CO.")):
        rep.warn("Corp suffix", f"'{name}' has no corp suffix — filer appends 'Inc.'; "
                 f"logged as DEFAULT_IN_USED:Company Name Suffix and noted on the record")
    _ownership_sum(rep, fields)


# --------------------------------------------------------------------------
# (b2) fail-visible source markers — static checks on the filing scripts
# --------------------------------------------------------------------------
def check_source_markers(rep):
    """Assert the fail-visible markers exist in the filing sources (B1–B5) and
    that the old silent-substitution code is gone."""
    required = [
        ("filing_utils.py",
         ["RA_PLACEHOLDER_IN_USE", "RA_ADDRESS_LINE1", "AVENIDA_ADDRESS_LINE1", "flag_needs_review"],
         "RA/Avenida env overrides + placeholder alarm token (B1)"),
        ("llc_filing_airtable.py",
         ["_extract_managers_from_airtable", "authorized_persons", "flag_needs_review"],
         "all-managers loop (B2) + fail-visible address gates (B3)"),
        ("corp_filing_airtable.py",
         ["DEFAULT_IN_USED", "flag_needs_review"],
         "explicit defaults (B4) + fail-visible address gates (B3)"),
        ("autofill_watcher.py",
         ["MAX_AUTOFILL_ATTEMPTS", "Autofill Attempts", "Needs Review"],
         "retry semantics: stay armed on failure, Needs Review after 3 (B5)"),
    ]
    banned = [
        # Old silent substitutions — must not come back
        ("llc_filing_airtable.py", "Using Avenida Legal's address for Principal"),
        ("corp_filing_airtable.py", "Using Avenida Legal's address for Principal"),
        ("llc_filing_airtable.py", "'33181' if"),
        ("corp_filing_airtable.py", "'33181' if"),
        ("llc_filing_airtable.py", "'00000'"),
        ("corp_filing_airtable.py", "'00000'"),
    ]
    for fname, markers, desc in required:
        path = os.path.join(REPO_ROOT, fname)
        try:
            src = open(path, encoding="utf-8").read()
        except OSError as e:
            rep.fail(f"Source markers: {fname}", str(e)[:120])
            continue
        missing = [m for m in markers if m not in src]
        if missing:
            rep.fail(f"Source markers: {fname}", f"missing {missing} — {desc}")
        else:
            rep.ok(f"Source markers: {fname}", desc)
    for fname, token in banned:
        path = os.path.join(REPO_ROOT, fname)
        try:
            src = open(path, encoding="utf-8").read()
        except OSError:
            continue
        if token in src:
            rep.fail(f"Silent-substitution token present: {fname}",
                     f"found {token!r} — the fail-visible rewrite (B3) removed this")
        else:
            rep.ok(f"Silent-substitution token gone: {fname}", f"{token!r} no longer present")


# --------------------------------------------------------------------------
# (c) EC2 watcher health
# --------------------------------------------------------------------------
def check_watcher(rep, env):
    try:
        import boto3
    except ImportError:
        rep.warn("boto3 unavailable", "skipping EC2 watcher checks")
        return
    sess = boto3.session.Session(
        aws_access_key_id=env.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=env.get("AWS_SECRET_ACCESS_KEY"),
    )

    # Instance state
    try:
        ec2 = sess.client("ec2", region_name=WATCHER_REGION)
        r = ec2.describe_instances(InstanceIds=[WATCHER_INSTANCE_ID])
        inst = r["Reservations"][0]["Instances"][0]
        st = inst["State"]["Name"]
        (rep.ok if st == "running" else rep.fail)(
            "EC2 watcher instance", f"{WATCHER_INSTANCE_ID} is {st}")
    except Exception as e:
        rep.fail("EC2 describe_instances", str(e)[:150])
        return

    # SSM ping
    ssm = sess.client("ssm", region_name=WATCHER_REGION)
    try:
        r = ssm.describe_instance_information(
            Filters=[{"Key": "InstanceIds", "Values": [WATCHER_INSTANCE_ID]}])
        infos = r["InstanceInformationList"]
        if infos and infos[0]["PingStatus"] == "Online":
            rep.ok("SSM agent", f"Online (last ping {infos[0]['LastPingDateTime']})")
        else:
            rep.fail("SSM agent", "not Online — cannot reach instance")
            return
    except Exception as e:
        rep.fail("SSM describe_instance_information", str(e)[:150])
        return

    # systemd service state + last journal timestamp (read-only)
    cmd = (
        f"systemctl is-active {WATCHER_SERVICE}; "
        f"systemctl is-enabled {WATCHER_SERVICE} 2>&1; "
        f"journalctl -u {WATCHER_SERVICE} -n 1 --no-pager -o short-iso 2>/dev/null | cut -c1-160; "
        "pgrep -fa 'autofill_watcher|filing_dispatcher|llc_filing|corp_filing' | grep -v pgrep || echo NO_FILING_PROCESS"
    )
    try:
        r = ssm.send_command(
            InstanceIds=[WATCHER_INSTANCE_ID],
            DocumentName="AWS-RunShellScript",
            Parameters={"commands": [cmd]},
        )
        cid = r["Command"]["CommandId"]
        out = None
        for _ in range(30):
            time.sleep(2)
            out = ssm.get_command_invocation(CommandId=cid, InstanceId=WATCHER_INSTANCE_ID)
            if out["Status"] not in ("Pending", "InProgress", "Delayed"):
                break
        stdout = (out or {}).get("StandardOutputContent", "")
        lines = [l.strip() for l in stdout.splitlines() if l.strip()]
        active = lines[0] if lines else "unknown"
        enabled = lines[1] if len(lines) > 1 else "unknown"
        lastlog = lines[2] if len(lines) > 2 else ""
        proc = lines[3] if len(lines) > 3 else ""
        # The unit is Type=simple wrapping a single-run script with
        # Restart=always/RestartSec=10, so a healthy watcher oscillates
        # active -> activating and its journal heartbeat is never old.
        # The 2026-02-17 failure mode was: unit file gone / inactive /
        # journal frozen. Judge that, not the instantaneous state.
        import datetime as _dt
        heartbeat_age = None
        m = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{4})?", lastlog)
        if m:
            try:
                ts = _dt.datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S")
                heartbeat_age = abs((_dt.datetime.utcnow() - ts).total_seconds())
            except ValueError:
                pass
        fresh = heartbeat_age is not None and heartbeat_age < 180
        if enabled != "enabled":
            rep.fail(f"systemd {WATCHER_SERVICE} not enabled",
                     f"is-enabled={enabled} — the 2026-02-17 failure mode (unit silently "
                     f"gone). Reinstall from the repo: sudo cp autofill-watcher.service "
                     f"/etc/systemd/system/ && sudo systemctl enable --now {WATCHER_SERVICE}")
        elif active == "active" or (active == "activating" and fresh):
            rep.ok(f"systemd {WATCHER_SERVICE}",
                   f"{active} (restart-loop poll; journal heartbeat {int(heartbeat_age or -1)}s old, enabled={enabled})")
        else:
            rep.fail(f"systemd {WATCHER_SERVICE} is {active}",
                     f"enabled={enabled}, heartbeat_age={int(heartbeat_age) if heartbeat_age is not None else 'unknown'}s. "
                     f"The watcher polls Airtable for Autofill=Yes — with it down, paid "
                     f"formations are NEVER filed. Start with: sudo systemctl start {WATCHER_SERVICE}")
        if lastlog:
            rep.info("Last watcher journal line", lastlog[:140])
        if proc and proc != "NO_FILING_PROCESS":
            rep.info("Filing process running", proc[:120])
    except Exception as e:
        rep.fail("SSM send_command (service check)", str(e)[:150])

    # Live Registered Agent: source the instance env and read what filing_utils
    # will actually put on the form. JOHN DOE (or any default) = FAIL; the RA
    # signature on a SunBiz filing is a legal attestation (s. 831.06, F.S.).
    ra_cmd = (
        "sudo -u ubuntu bash -c 'cd /home/ubuntu/company-questionnaire; "
        "set -a; source /home/ubuntu/.airtable_env; set +a; "
        "python3 -c \"from filing_utils import REGISTERED_AGENT as ra; "
        "print(ra[\\\"first_name\\\"], ra[\\\"last_name\\\"], \\\"|\\\", "
        "ra[\\\"address1\\\"], ra.get(\\\"address2\\\",\\\"\\\"), "
        "ra[\\\"city\\\"], ra[\\\"state\\\"], ra[\\\"zip\\\"])\"'"
    )
    try:
        r = ssm.send_command(
            InstanceIds=[WATCHER_INSTANCE_ID],
            DocumentName="AWS-RunShellScript",
            Parameters={"commands": [ra_cmd]},
        )
        cid = r["Command"]["CommandId"]
        out = None
        for _ in range(30):
            time.sleep(2)
            out = ssm.get_command_invocation(CommandId=cid, InstanceId=WATCHER_INSTANCE_ID)
            if out["Status"] not in ("Pending", "InProgress", "Delayed"):
                break
        ra_out = ((out or {}).get("StandardOutputContent", "") or "").strip()
        name_part = ra_out.split("|")[0].strip().upper() if ra_out else ""
        if not ra_out or "JOHN DOE" in name_part or "PLACEHOLDER" in ra_out.upper():
            rep.fail("Registered Agent live value",
                     f"'{ra_out or 'no output'}' — placeholder RA on the instance; "
                     f"set RA_FIRST_NAME/RA_LAST_NAME/RA_ADDRESS_* in /home/ubuntu/.airtable_env")
        else:
            rep.ok("Registered Agent live value", ra_out.splitlines()[-1][:140])
    except Exception as e:
        rep.fail("SSM send_command (RA check)", str(e)[:150])

    # Payment parameter existence (never the value)
    try:
        r = ssm.describe_parameters(
            ParameterFilters=[{"Key": "Name", "Values": [PAYMENT_PARAM]}])
        if r["Parameters"]:
            p = r["Parameters"][0]
            rep.ok("Payment parameter exists", f"{PAYMENT_PARAM} ({p['Type']}, "
                   f"last modified {p['LastModifiedDate'].date()})")
        else:
            rep.fail("Payment parameter", f"{PAYMENT_PARAM} not found — real filings "
                     "cannot pay (filing_utils.py:138)")
    except Exception as e:
        rep.warn("SSM describe_parameters", str(e)[:150])

    # Audit bucket heartbeat
    try:
        s3 = sess.client("s3", region_name=WATCHER_REGION)
        paginator = s3.get_paginator("list_objects_v2")
        newest = None
        count = 0
        for page in paginator.paginate(Bucket=AUDIT_BUCKET):
            for o in page.get("Contents", []):
                count += 1
                if newest is None or o["LastModified"] > newest:
                    newest = o["LastModified"]
        if newest:
            age_days = (datetime.now(timezone.utc) - newest).days
            (rep.ok if age_days < 30 else rep.warn)(
                "S3 audit trail", f"newest of {count} objects {newest.date()} "
                f"({age_days}d ago) in s3://{AUDIT_BUCKET}")
        else:
            rep.warn("S3 audit trail", "bucket empty or inaccessible")
    except Exception as e:
        rep.warn("S3 audit bucket check", str(e)[:150])


# --------------------------------------------------------------------------
# Self-test fixture
# --------------------------------------------------------------------------
SELFTEST_RECORD = {
    "id": "recSELFTEST0000",
    "fields": {
        "Company Name": "Wiring Selftest LLC",
        "Entity Type": "LLC",
        "Formation State": "Florida",
        "Formation Status": "Pending",
        "Autofill": "Yes",
        "Stripe Payment ID": "cs_test_selftest",
        "Customer Email": "selftest@example.com",
        "Customer Name": "Self Test",
        "Company Address": "123 Main St, Miami, FL 33131",
        "Business Purpose": "Software consulting services",
        "Manager 1 Name": "Alice Example",
        "Manager 1 First Name": "Alice",
        "Manager 1 Last Name": "Example",
        "Manager 1 Address": "456 Oak Ave, Orlando, FL 32801",
        "Manager 2 Name": "Bob Sample",
        "Manager 2 First Name": "Bob",
        "Manager 2 Last Name": "Sample",
        "Manager 2 Address": "789 Pine St, Tampa, FL 33602",
        "Managers Count": 2,
        "Owner 1 Name": "Alice Example",
        "Owner 1 Ownership %": 1.0,
    },
}


def main():
    ap = argparse.ArgumentParser(description="Verify Sunbiz auto-filing wiring (dry-run only)")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--record", help="Airtable record id (rec...)")
    g.add_argument("--selftest", action="store_true", help="validate the built-in fixture")
    ap.add_argument("--skip-aws", action="store_true", help="skip EC2/SSM/S3 watcher checks")
    args = ap.parse_args()

    env = load_env(os.path.join(REPO_ROOT, ".env.local"))
    rep = Report()

    print("=" * 72)
    print("SUNBIZ AUTO-FILING WIRING REPORT — dry-run, no filing, no writes")
    print("=" * 72)

    if args.selftest:
        print("\n[1/3] Record: built-in self-test fixture")
        validate_record(rep, SELFTEST_RECORD)
    else:
        print(f"\n[1/3] Record: {args.record} (read-only fetch from Airtable)")
        try:
            record = airtable_get(env, args.record)
        except Exception as e:
            rep.fail("Airtable fetch", str(e)[:200])
            print(rep.render())
            sys.exit(2)
        validate_record(rep, record)

    print("\n[2/3] Filing-source markers (fail-visible rewrites B1–B5 present, "
          "silent substitutions gone)")
    check_source_markers(rep)

    print("\n[3/3] EC2 watcher health")
    if args.skip_aws:
        rep.info("EC2 checks skipped", "--skip-aws")
    else:
        check_watcher(rep, env)

    print()
    print(rep.render())
    sys.exit(1 if rep.failed else 0)


if __name__ == "__main__":
    main()
