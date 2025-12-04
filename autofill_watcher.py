#!/usr/bin/env python3
"""
Autofill Watcher - Continuously monitors Airtable for new filings
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
    print("❌ Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables")
    print("   Set them in /etc/environment or export them before running")
    exit(1)

# Poll interval in seconds
POLL_INTERVAL = 30

def get_pending_records():
    """Fetch records ready for autofill"""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    
    formula = """AND(
        {Formation Status} = 'Pending',
        {Formation State} = 'Florida',
        {Stripe Payment ID} != '',
        {Entity Type} = 'LLC',
        {Autofill} = 'Yes'
    )"""
    
    records = table.all(formula=formula, sort=["-Payment Date"])
    return records

def mark_as_processing(record_id):
    """Mark record as being processed to avoid duplicate runs"""
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    table.update(record_id, {'Formation Status': 'In Progress'})

def run_autofill(record_id):
    """Run the autofill script for a specific record"""
    script_path = os.path.join(os.path.dirname(__file__), 'llc_filing_airtable.py')
    
    print(f"\n{'='*60}")
    print(f"🚀 Starting autofill for record: {record_id}")
    print(f"{'='*60}\n")
    
    result = subprocess.run(
        ['python3', script_path, record_id],
        capture_output=False,
        text=True
    )
    
    return result.returncode == 0

def main():
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           🤖 SUNBIZ AUTOFILL WATCHER                         ║
║                                                              ║
║   Monitoring Airtable for new Florida LLC filings...        ║
║   Poll interval: {POLL_INTERVAL} seconds                              ║
║                                                              ║
║   Press Ctrl+C to stop                                       ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    processed_ids = set()  # Track processed records to avoid duplicates
    
    while True:
        try:
            timestamp = datetime.now().strftime("%H:%M:%S")
            
            records = get_pending_records()
            new_records = [r for r in records if r['id'] not in processed_ids]
            
            if new_records:
                print(f"\n[{timestamp}] 📋 Found {len(new_records)} new record(s) to process!")
                
                for record in new_records:
                    record_id = record['id']
                    company_name = record['fields'].get('Company Name', 'Unknown')
                    
                    print(f"\n[{timestamp}] 🏢 Processing: {company_name}")
                    
                    try:
                        # Mark as processing first
                        mark_as_processing(record_id)
                        
                        # Run the autofill
                        success = run_autofill(record_id)
                        
                        if success:
                            print(f"[{timestamp}] ✅ Completed: {company_name}")
                        else:
                            print(f"[{timestamp}] ⚠️ Autofill returned non-zero for: {company_name}")
                        
                        # Mark as processed regardless
                        processed_ids.add(record_id)
                        
                    except Exception as e:
                        print(f"[{timestamp}] ❌ Error processing {company_name}: {e}")
                        processed_ids.add(record_id)  # Don't retry failed records
            else:
                print(f"[{timestamp}] 👀 Watching... (no new records)", end='\r')
            
            time.sleep(POLL_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n\n👋 Watcher stopped by user")
            break
        except Exception as e:
            print(f"\n[ERROR] {e}")
            print("Retrying in 60 seconds...")
            time.sleep(60)

if __name__ == "__main__":
    main()

