#!/usr/bin/env python3
"""Fix the parse_address function to handle US addresses ending with USA"""
import re

with open("/home/ubuntu/llc_filing_airtable.py", "r") as f:
    content = f.read()

# Find the parse_address function and fix it
old_start = '''def parse_address(address_str, is_international=False):
    """Parse address string into components - handles both US and international"""
    if not address_str:
        return {}
    
    parts = {}
    
    # Check if it looks like an international address'''

new_start = '''def parse_address(address_str, is_international=False):
    """Parse address string into components - handles both US and international"""
    if not address_str:
        return {}
    
    parts = {}
    
    # Check if address ends with USA - then parse as US address
    if address_str.strip().upper().endswith('USA') or 'UNITED STATES' in address_str.upper():
        # Remove USA/United States suffix
        clean_addr = re.sub(r',?\s*(USA|United States)\s*$', '', address_str, flags=re.IGNORECASE).strip()
        sections = [s.strip() for s in clean_addr.split(',')]
        if len(sections) >= 3:
            parts['line1'] = sections[0]
            parts['line2'] = ''
            parts['city'] = sections[1]
            state_zip = sections[2].split()
            parts['state'] = state_zip[0] if state_zip else ''
            parts['zip'] = state_zip[1] if len(state_zip) > 1 else ''
            parts['country'] = 'US'
            return parts
    
    # Check if it looks like an international address'''

content = content.replace(old_start, new_start)

with open("/home/ubuntu/llc_filing_airtable.py", "w") as f:
    f.write(content)

print("Fixed parse_address to handle US addresses ending with USA!")

