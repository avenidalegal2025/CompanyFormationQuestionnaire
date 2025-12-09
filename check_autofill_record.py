#!/usr/bin/env python3
"""
Script to check why a specific Airtable record is not being picked up by the autofill watcher
Usage: python3 check_autofill_record.py <record_id>
"""
import os
import sys
from pyairtable import Api

# Configuration - set these environment variables
AIRTABLE_API_KEY = os.environ.get("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
AIRTABLE_TABLE_NAME = os.environ.get("AIRTABLE_TABLE_NAME", "Formations")

if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
    print("❌ Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables")
    print("   Set them in /etc/environment or export them before running")
    sys.exit(1)

if len(sys.argv) < 2:
    print("Usage: python3 check_autofill_record.py <record_id>")
    print("   Or: python3 check_autofill_record.py <company_name>")
    sys.exit(1)

record_id_or_name = sys.argv[1]

def check_record(record):
    """Check if a record meets all autofill conditions"""
    fields = record.get('fields', {})
    
    print(f"\n{'='*60}")
    print(f"📋 Checking record: {fields.get('Company Name', 'Unknown')}")
    print(f"{'='*60}\n")
    
    # Check each condition
    conditions = {
        "Formation Status is 'Pending' or 'In Progress'": fields.get('Formation Status', '') in ['Pending', 'In Progress'],
        "Formation State is 'Florida'": fields.get('Formation State', '') == 'Florida',
        "Stripe Payment ID is not empty": bool(fields.get('Stripe Payment ID', '')),
        "Entity Type is 'LLC'": fields.get('Entity Type', '') == 'LLC',
        "Autofill is 'Yes'": fields.get('Autofill', '') == 'Yes',
        "Formation Status is not 'Filed'": fields.get('Formation Status', '') != 'Filed',
        "Formation Status is not 'Completed'": fields.get('Formation Status', '') != 'Completed',
    }
    
    print("📊 Condition Check:")
    all_passed = True
    for condition, passed in conditions.items():
        status = "✅" if passed else "❌"
        print(f"   {status} {condition}")
        if not passed:
            all_passed = False
    
    print(f"\n📋 Current Field Values:")
    print(f"   Formation Status: '{fields.get('Formation Status', 'NOT SET')}'")
    print(f"   Formation State: '{fields.get('Formation State', 'NOT SET')}'")
    print(f"   Stripe Payment ID: '{fields.get('Stripe Payment ID', 'NOT SET')}'")
    print(f"   Entity Type: '{fields.get('Entity Type', 'NOT SET')}'")
    print(f"   Autofill: '{fields.get('Autofill', 'NOT SET')}'")
    
    print(f"\n{'='*60}")
    if all_passed:
        print("✅ All conditions PASSED - Record should be processed by watcher")
        print("\n💡 If the watcher is not processing this record:")
        print("   1. Check if the watcher service is running on EC2:")
        print("      sudo systemctl status autofill-watcher")
        print("   2. Check the watcher logs:")
        print("      sudo journalctl -u autofill-watcher -f")
        print("   3. Verify the watcher can see this record (should appear in logs)")
    else:
        print("❌ Some conditions FAILED - Record will NOT be processed")
        print("\n💡 To fix:")
        failed_conditions = [cond for cond, passed in conditions.items() if not passed]
        for cond in failed_conditions:
            print(f"   - {cond}")
        print("\n📝 Quick fixes:")
        if not conditions["Formation Status is 'Pending' or 'In Progress'"]:
            print("   → Change Formation Status to 'Pending' or 'In Progress' in Airtable")
        if not conditions["Autofill is 'Yes'"]:
            print("   → Set Autofill to 'Yes' in Airtable")
        if not conditions["Entity Type is 'LLC'"]:
            print("   → Note: Watcher only processes LLCs, not Corporations")
        if not conditions["Stripe Payment ID is not empty"]:
            print("   → Ensure Stripe Payment ID field has a value")
    print(f"{'='*60}\n")
    
    return all_passed

def main():
    api = Api(AIRTABLE_API_KEY)
    table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME)
    
    # Try to find record by ID first, then by company name
    try:
        # Check if it's a record ID (starts with 'rec')
        if record_id_or_name.startswith('rec'):
            record = table.get(record_id_or_name)
            check_record(record)
        else:
            # Search by company name
            formula = f"{{Company Name}} = '{record_id_or_name}'"
            records = table.all(formula=formula)
            
            if not records:
                print(f"❌ No record found with Company Name: {record_id_or_name}")
                print("\n💡 Try searching by record ID instead")
                sys.exit(1)
            
            if len(records) > 1:
                print(f"⚠️ Found {len(records)} records with that name. Checking all:\n")
                for record in records:
                    check_record(record)
            else:
                check_record(records[0])
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

