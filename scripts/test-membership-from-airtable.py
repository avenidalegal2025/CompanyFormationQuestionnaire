#!/usr/bin/env python3
"""Test Membership Registry generation from Airtable record"""

import os
import sys
import json
import requests
from airtable import Airtable

AIRTABLE_API_KEY = os.environ.get('AIRTABLE_API_KEY', '')
AIRTABLE_BASE_ID = os.environ.get('AIRTABLE_BASE_ID', 'app8Ggz2miYds1F38')
AIRTABLE_TABLE_NAME = 'Formations'
LAMBDA_URL = os.environ.get('LAMBDA_MEMBERSHIP_REGISTRY_URL', 'https://zyw2gv6oueycst2ditnylxw3ua0ekvrr.lambda-url.us-west-1.on.aws/')

airtable = Airtable(AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME, api_key=AIRTABLE_API_KEY)

def map_airtable_to_membership_registry(record):
    fields = record.get('fields', {})
    
    company_name = fields.get('Company Name', '')
    company_address = fields.get('Company Address', '')
    formation_state = fields.get('Formation State', '')
    
    # Formation date
    payment_date = fields.get('Payment Date')
    if payment_date:
        from datetime import datetime
        try:
            date = datetime.fromisoformat(payment_date.replace('Z', '+00:00'))
            formation_date = date.strftime('%m/%d/%Y')
        except:
            from datetime import date
            formation_date = date.today().strftime('%m/%d/%Y')
    else:
        from datetime import date
        formation_date = date.today().strftime('%m/%d/%Y')
    
    # Collect members
    members = []
    owner_count = fields.get('Owner Count', 0)
    
    for i in range(1, min(owner_count, 6) + 1):
        owner_name = fields.get(f'Owner {i} Name', '').strip()
        if not owner_name:
            continue
        
        ownership_percent = fields.get(f'Owner {i} Ownership %', 0)
        if 0 < ownership_percent < 1:
            ownership_percent = ownership_percent * 100
        
        owner_address = fields.get(f'Owner {i} Address', '').strip()
        owner_ssn = fields.get(f'Owner {i} SSN', '')
        
        if owner_ssn and owner_ssn.upper() not in ['N/A', ''] and 'FOREIGN' not in owner_ssn.upper():
            ssn = owner_ssn
        else:
            ssn = None
        
        members.append({
            'name': owner_name,
            'address': owner_address,
            'ownershipPercent': ownership_percent,
            'ssn': ssn
        })
    
    members.sort(key=lambda x: x['ownershipPercent'], reverse=True)
    
    # Collect managers
    managers = []
    manager_count = fields.get('Managers Count', 0)
    
    for i in range(1, min(manager_count, 6) + 1):
        manager_name = fields.get(f'Manager {i} Name', '').strip()
        if not manager_name:
            continue
        
        manager_address = fields.get(f'Manager {i} Address', '').strip()
        
        managers.append({
            'name': manager_name,
            'address': manager_address
        })
    
    return {
        'companyName': company_name,
        'companyAddress': company_address,
        'formationState': formation_state,
        'formationDate': formation_date,
        'members': members,
        'managers': managers,
        'memberCount': len(members),
        'managerCount': len(managers)
    }

def get_template_name(member_count, manager_count):
    members = min(max(member_count, 1), 6)
    managers = min(max(manager_count, 0), 6)
    
    folder_name = 'membership-registry-1-member' if members == 1 else f'membership-registry-{members}-members'
    file_name = f'Template Membership Registry_{members} Members_{managers} Manager.docx'
    
    return f'llc-formation-templates/membership-registry-all-templates/{folder_name}/{file_name}'

def main():
    record_id = sys.argv[1] if len(sys.argv) > 1 else None
    
    print('🚀 Membership Registry Generator (Direct Lambda)\n')
    print(f'📊 Airtable Base: {AIRTABLE_BASE_ID}')
    print(f'🔗 Lambda URL: {LAMBDA_URL}\n')
    
    # Find record
    if record_id:
        print(f'🔍 Fetching record: {record_id}')
        try:
            record = airtable.get(record_id)
        except Exception as e:
            print(f'❌ Error: {e}')
            sys.exit(1)
    else:
        print('🔍 Searching for LLC records...')
        records = airtable.get_all(formula="{Entity Type} = 'LLC'", max_records=5)
        if not records:
            print('❌ No LLC records found')
            sys.exit(1)
        
        for r in records:
            if r['fields'].get('Owner 1 Name'):
                record = r
                break
        else:
            record = records[0]
    
    print(f"✅ Found: {record['fields'].get('Company Name', 'Unknown')} ({record['id']})")
    
    # Map data
    membership_data = map_airtable_to_membership_registry(record)
    print(f"   Members: {membership_data['memberCount']}, Managers: {membership_data['managerCount']}")
    
    # Get template
    template_path = get_template_name(membership_data['memberCount'], membership_data['managerCount'])
    template_url = f"https://company-formation-template-llc-and-inc.s3.us-west-1.amazonaws.com/{template_path}"
    
    print(f"\n📄 Template: {template_path}")
    
    # Get vault path
    vault_path = record['fields'].get('Vault Path', '')
    if not vault_path:
        company_name = record['fields'].get('Company Name', 'Company')
        vault_path = ''.join(c.lower() if c.isalnum() else '-' for c in company_name)[:50]
    
    file_name = f"membership-registry-{''.join(c.lower() if c.isalnum() else '-' for c in record['fields'].get('Company Name', 'Company'))[:50]}.docx"
    s3_key = f"{vault_path}/formation/{file_name}"
    
    print(f"📁 Destination: s3://avenida-legal-documents/{s3_key}")
    
    # Call Lambda
    payload = {
        'form_data': membership_data,
        's3_bucket': 'avenida-legal-documents',
        's3_key': s3_key,
        'templateUrl': template_url,
        'return_docx': True
    }
    
    print(f"\n📞 Calling Lambda...")
    
    try:
        response = requests.post(LAMBDA_URL, json=payload, timeout=300)
        
        print(f"📡 Response: {response.status_code}")
        
        if response.status_code == 200:
            print(f"✅ Membership Registry generated! ({len(response.content)} bytes)")
            print(f"📁 S3 Key: {s3_key}")
            
            # Save document locally
            output_file = f"/tmp/membership-registry-{record['id']}.docx"
            with open(output_file, 'wb') as f:
                f.write(response.content)
            print(f"💾 Saved to: {output_file}")
            print(f"\n✅ Success! Document generated and saved.")
            return 0
        else:
            print(f"❌ Error: {response.text}")
            return 1
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())
