#!/usr/bin/env python3
"""
Filing Dispatcher - Routes Sunbiz filings to the correct script based on entity type.

Called by autofill_watcher.py (or manually) with an Airtable record ID.
Reads the entity type from the record and delegates to:
  - llc_filing_airtable.py   for LLC
  - corp_filing_airtable.py  for C-Corp / S-Corp
"""
import os
os.environ["DISPLAY"] = ":1"

import sys

from filing_utils import fetch_airtable_record, update_airtable_status


def dispatch(record_id):
    """
    Fetch the Airtable record, determine entity type, and run the appropriate filing script.

    Args:
        record_id: Airtable record ID (e.g. "recXXXXXXXX")
    """
    print(f"\U0001f4e6 Dispatcher: fetching record {record_id} ...")
    record, fields = fetch_airtable_record(record_id)

    entity_type = fields.get("Entity Type", "")
    company_name = fields.get("Company Name", "Unknown")
    state = fields.get("Formation State", "")

    print(f"\U0001f3e2 Company: {company_name}")
    print(f"   Entity Type: {entity_type}")
    print(f"   State: {state}")

    if state != "Florida":
        msg = f"Cannot file on Sunbiz: Formation State is '{state}', not Florida"
        print(f"\u274c {msg}")
        update_airtable_status(record_id, "Pending", msg)
        return False

    if entity_type == "LLC":
        print("\u27a1\ufe0f  Routing to LLC filing script...")
        from llc_filing_airtable import main as llc_main
        llc_main(record_id=record_id)
        return True

    elif entity_type in ("C-Corp", "S-Corp"):
        print(f"\u27a1\ufe0f  Routing to Corporation filing script ({entity_type})...")
        from corp_filing_airtable import main as corp_main
        corp_main(record_id=record_id)
        return True

    else:
        msg = f"Unsupported entity type: '{entity_type}'. Supported: LLC, C-Corp, S-Corp"
        print(f"\u274c {msg}")
        update_airtable_status(record_id, "Pending", msg)
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2 or not sys.argv[1].startswith("rec"):
        print("Usage: python3 filing_dispatcher.py recXXXXXXXXX")
        print("  Routes to the correct filing script based on entity type.")
        sys.exit(1)

    rec_id = sys.argv[1]
    try:
        success = dispatch(rec_id)
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\u274c Dispatcher error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
