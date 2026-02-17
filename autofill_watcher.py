#!/usr/bin/env python3
"""
Autofill Watcher - Continuously monitors Airtable for new filings.
Supports LLC, C-Corp, and S-Corp entity types.
Routes to the correct filing script via filing_dispatcher.py.

Run this on EC2: python3 autofill_watcher.py
"""
import os
import time
import subprocess
from datetime import datetime

# Set display for headless operation
os.environ["DISPLAY"] = ":1"

from pyairtable import Api

# Configuration - set these environment variables on EC2
AIRTABLE_API_KEY = os.environ.get("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
AIRTABLE_TABLE_NAME = os.environ.get("AIRTABLE_TABLE_NAME", "Formations")

if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
    print("\u274c Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables")
    print("   Set them in /etc/environment or export them before running")
    exit(1)

# Poll interval in seconds
POLL_INTERVAL = 30


def get_pending_records():
    """Fetch records ready for autofill (LLC, C-Corp, S-Corp)."""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)

    # Accept LLC, C-Corp, and S-Corp entity types
    formula = """AND(
        OR(
            {Formation Status} = 'Pending',
            {Formation Status} = 'In Progress'
        ),
        {Formation State} = 'Florida',
        {Stripe Payment ID} != '',
        OR(
            {Entity Type} = 'LLC',
            {Entity Type} = 'C-Corp',
            {Entity Type} = 'S-Corp'
        ),
        {Autofill} = 'Yes',
        {Formation Status} != 'Filed',
        {Formation Status} != 'Completed'
    )"""

    try:
        records = table.all(formula=formula, sort=["-Payment Date"])
        print(f"\U0001f50d Formula query returned {len(records)} record(s)")
        if records:
            for r in records:
                company_name = r['fields'].get('Company Name', 'Unknown')
                status = r['fields'].get('Formation Status', 'NOT SET')
                autofill = r['fields'].get('Autofill', 'NOT SET')
                entity_type = r['fields'].get('Entity Type', 'N/A')
                print(f"   \U0001f4cb Found: {company_name} ({entity_type}) (Status: {status}, Autofill: {autofill})")
        return records
    except Exception as e:
        print(f"\u274c Error querying Airtable: {e}")
        import traceback
        traceback.print_exc()
        return []


def mark_as_processing(record_id):
    """Mark record as being processed to avoid duplicate runs."""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    table.update(record_id, {'Formation Status': 'In Progress'})


def run_autofill(record_id):
    """Run the filing dispatcher for a specific record."""
    # Use the dispatcher instead of calling LLC script directly
    script_path = os.path.join(os.path.dirname(__file__), 'filing_dispatcher.py')

    print(f"\n{'=' * 60}")
    print(f"\U0001f680 Starting autofill for record: {record_id}")
    print(f"{'=' * 60}\n")

    result = subprocess.run(
        ['python3', script_path, record_id],
        capture_output=False,
        text=True,
    )

    return result.returncode == 0


def main():
    print(f"""
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551           \U0001f916 SUNBIZ AUTOFILL WATCHER                         \u2551
\u2551                                                              \u2551
\u2551   Monitoring Airtable for Florida filings...                \u2551
\u2551   Entity types: LLC, C-Corp, S-Corp                        \u2551
\u2551   Poll interval: {POLL_INTERVAL} seconds                              \u2551
\u2551                                                              \u2551
\u2551   Press Ctrl+C to stop                                       \u2551
\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d
    """)

    while True:
        try:
            timestamp = datetime.now().strftime("%H:%M:%S")

            records = get_pending_records()

            new_records = []
            for r in records:
                status = r['fields'].get('Formation Status', '')
                company_name = r['fields'].get('Company Name', 'Unknown')
                autofill = r['fields'].get('Autofill', 'NOT SET')
                entity_type = r['fields'].get('Entity Type', 'N/A')
                if status in ['Pending', 'In Progress']:
                    new_records.append(r)
                    print(f"   \u2705 {company_name} ({entity_type}) meets all conditions (Status: {status}, Autofill: {autofill})")
                else:
                    print(f"   \u26a0\ufe0f {company_name} skipped (Status: {status}, not Pending/In Progress)")

            if new_records:
                print(f"\n[{timestamp}] \U0001f4cb Found {len(new_records)} new record(s) to process!")

                for record in new_records:
                    record_id = record['id']
                    company_name = record['fields'].get('Company Name', 'Unknown')
                    entity_type = record['fields'].get('Entity Type', 'N/A')

                    print(f"\n[{timestamp}] \U0001f3e2 Processing: {company_name} ({entity_type})")

                    try:
                        mark_as_processing(record_id)
                        success = run_autofill(record_id)

                        if success:
                            print(f"[{timestamp}] \u2705 Completed: {company_name} ({entity_type})")
                        else:
                            print(f"[{timestamp}] \u26a0\ufe0f Autofill returned non-zero for: {company_name}")

                    except Exception as e:
                        print(f"[{timestamp}] \u274c Error processing {company_name}: {e}")
            else:
                print(f"[{timestamp}] \U0001f440 Watching... (no new records)", end='\r')

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            print("\n\n\U0001f44b Watcher stopped by user")
            break
        except Exception as e:
            print(f"\n[ERROR] {e}")
            print("Retrying in 60 seconds...")
            time.sleep(60)


if __name__ == "__main__":
    main()
