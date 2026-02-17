#!/usr/bin/env python3
"""
Autofill Watcher - Processes Airtable records for Sunbiz filing.
Supports LLC, C-Corp, and S-Corp entity types.
Routes to the correct filing script via filing_dispatcher.py.

DEFAULT MODE: Run once — process all pending records, then exit.
WATCH MODE:  Only with --watch flag — poll continuously every 30s.

Usage:
  python3 autofill_watcher.py            # Run once, process pending, exit
  python3 autofill_watcher.py --watch    # Continuous polling (use with caution)
  python3 autofill_watcher.py --dry-run  # Show what would be filed, don't open browser
"""
import os
import sys
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

# Poll interval in seconds (only used in --watch mode)
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
        print(f"\U0001f50d Found {len(records)} record(s) matching autofill criteria")
        for r in records:
            company_name = r['fields'].get('Company Name', 'Unknown')
            status = r['fields'].get('Formation Status', 'NOT SET')
            entity_type = r['fields'].get('Entity Type', 'N/A')
            print(f"   \U0001f4cb {company_name} ({entity_type}) — Status: {status}")
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


def clear_autofill_flag(record_id):
    """Set Autofill back to 'No' after processing so it doesn't re-run."""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    table.update(record_id, {'Autofill': 'No'})
    print(f"   \U0001f6d1 Autofill flag cleared for {record_id}")


def run_autofill(record_id):
    """Run the filing dispatcher for a specific record."""
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


def process_records(records, dry_run=False):
    """Process a list of records. Returns (success_count, fail_count)."""
    success = 0
    failed = 0
    timestamp = datetime.now().strftime("%H:%M:%S")

    for record in records:
        record_id = record['id']
        company_name = record['fields'].get('Company Name', 'Unknown')
        entity_type = record['fields'].get('Entity Type', 'N/A')

        print(f"\n[{timestamp}] \U0001f3e2 Processing: {company_name} ({entity_type})")

        if dry_run:
            print(f"   \U0001f4dd DRY RUN — would file {company_name} ({entity_type})")
            print(f"   Record ID: {record_id}")
            print(f"   Status: {record['fields'].get('Formation Status', 'N/A')}")
            print(f"   Email: {record['fields'].get('Customer Email', 'N/A')}")
            success += 1
            continue

        try:
            mark_as_processing(record_id)
            ok = run_autofill(record_id)

            # Always clear Autofill flag after attempt (success or fail)
            # This prevents infinite re-runs
            clear_autofill_flag(record_id)

            if ok:
                print(f"[{timestamp}] \u2705 Completed: {company_name} ({entity_type})")
                success += 1
            else:
                print(f"[{timestamp}] \u26a0\ufe0f Autofill returned non-zero for: {company_name}")
                failed += 1

        except Exception as e:
            print(f"[{timestamp}] \u274c Error processing {company_name}: {e}")
            # Still clear the flag to prevent infinite retries
            try:
                clear_autofill_flag(record_id)
            except Exception:
                pass
            failed += 1

    return success, failed


def run_once(dry_run=False):
    """Run once: fetch pending records, process them, exit."""
    mode = "DRY RUN" if dry_run else "SINGLE RUN"
    print(f"\n\U0001f916 Sunbiz Autofill — {mode}")
    print(f"   Entity types: LLC, C-Corp, S-Corp")
    print(f"   Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    records = get_pending_records()

    if not records:
        print("\n\u2705 No pending records. Nothing to do.")
        return

    print(f"\n\U0001f4cb {len(records)} record(s) to process")

    success, failed = process_records(records, dry_run=dry_run)

    print(f"\n{'=' * 50}")
    print(f"\U0001f4ca Results: {success} succeeded, {failed} failed")
    print(f"\u2705 Done. Exiting.")


def watch_loop():
    """Continuous polling mode. Only use with --watch flag."""
    print(f"""
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551   \u26a0\ufe0f  CONTINUOUS WATCH MODE                              \u2551
\u2551   Entity types: LLC, C-Corp, S-Corp                        \u2551
\u2551   Poll interval: {POLL_INTERVAL} seconds                              \u2551
\u2551   Press Ctrl+C to stop                                       \u2551
\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d
    """)

    while True:
        try:
            records = get_pending_records()

            if records:
                process_records(records)
            else:
                ts = datetime.now().strftime("%H:%M:%S")
                print(f"[{ts}] \U0001f440 Watching... (no new records)", end='\r')

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            print("\n\n\U0001f44b Watcher stopped by user")
            break
        except Exception as e:
            print(f"\n[ERROR] {e}")
            print("Retrying in 60 seconds...")
            time.sleep(60)


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--dry-run" in args:
        run_once(dry_run=True)
    elif "--watch" in args:
        watch_loop()
    else:
        # Default: run once and exit
        run_once()
