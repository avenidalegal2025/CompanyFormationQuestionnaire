#!/usr/bin/env python3
"""
Interactive tool to adjust SS-4 field coordinates
Helps identify misaligned fields and update coordinates
"""

import sys
import os
import json
from pathlib import Path

# Add lambda-functions to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lambda-functions'))
from ss4_lambda_s3_complete import FIELD_COORDS, CHECK_COORDS

def show_current_coordinates():
    """Display current coordinates"""
    print("\n" + "="*70)
    print("CURRENT TEXT FIELD COORDINATES")
    print("="*70)
    print(f"{'Field Name':<25} {'X':<8} {'Y':<8} {'Description'}")
    print("-"*70)
    
    field_descriptions = {
        "Line 1": "Legal name of entity",
        "Line 2": "Trade name",
        "Line 3": "Mailing address line 1",
        "Line 4a": "Mailing address line 2",
        "Line 4b": "City, State, ZIP (mailing)",
        "Line 5a": "Street address line 1",
        "Line 5b": "Street address line 2",
        "Line 6": "City, State, ZIP (street)",
        "Line 7a": "Responsible party name",
        "Line 7b": "Responsible party SSN/ITIN/EIN",
        "8b": "Date business started",
        "9b": "Closing month / State of incorporation",
        "10": "Highest number of employees",
        "11": "Principal activity",
        "12": "Principal activity code",
        "13_Ag": "Agricultural employees",
        "13_Hh": "Household employees",
        "13_Ot": "Other employees",
        "15": "First date wages paid",
        "17": "Additional information",
        "Designee Name": "Third party designee name",
        "Designee Address": "Third party designee address",
        "Designee Phone": "Third party designee phone",
        "Designee Fax": "Third party designee fax",
        "Applicant Phone": "Applicant phone",
        "Applicant Fax": "Applicant fax",
        "Signature Name": "Signature name",
    }
    
    for field, (x, y) in sorted(FIELD_COORDS.items()):
        desc = field_descriptions.get(field, "")
        print(f"{field:<25} {x:<8} {y:<8} {desc}")
    
    print("\n" + "="*70)
    print("CURRENT CHECKBOX COORDINATES")
    print("="*70)
    print(f"{'Checkbox Name':<25} {'X':<8} {'Y':<8} {'Description'}")
    print("-"*70)
    
    checkbox_descriptions = {
        "8a_yes": "Is this a LLC? (Yes)",
        "8c_yes": "LLC organized in US? (Yes)",
        "9a": "Entity type (various options)",
        "10": "Reason for applying",
        "14": "First date wages paid",
        "16": "Principal line of merchandise",
        "18_no": "Third party designee (No)",
    }
    
    for checkbox, coords in sorted(CHECK_COORDS.items()):
        if isinstance(coords, list) and len(coords) >= 2:
            x, y = coords[0], coords[1]
        elif isinstance(coords, tuple) and len(coords) >= 2:
            x, y = coords[0], coords[1]
        else:
            x, y = "?", "?"
        desc = checkbox_descriptions.get(checkbox, "")
        print(f"{checkbox:<25} {x:<8} {y:<8} {desc}")

def update_coordinate(field_name, new_x, new_y, is_checkbox=False):
    """Update a single coordinate"""
    lambda_file = os.path.join(os.path.dirname(__file__), '..', 'lambda-functions', 'ss4_lambda_s3_complete.py')
    
    if not os.path.exists(lambda_file):
        print(f"❌ Lambda file not found: {lambda_file}")
        return False
    
    # Read current file
    with open(lambda_file, 'r') as f:
        content = f.read()
    
    if is_checkbox:
        # Update checkbox coordinate
        pattern = f'"{field_name}":\\s*\\[\\s*\\d+\\s*,\\s*\\d+\\s*\\]'
        replacement = f'"{field_name}": [{new_x}, {new_y}]'
        
        if pattern.replace('\\', '') not in content and f'"{field_name}"' in content:
            # Try different format
            pattern = f'"{field_name}":\\s*\\(\\s*\\d+\\s*,\\s*\\d+\\s*\\)'
            replacement = f'"{field_name}": ({new_x}, {new_y})'
    else:
        # Update field coordinate
        pattern = f'"{field_name}":\\s*\\(\\s*\\d+\\s*,\\s*\\d+\\s*\\)'
        replacement = f'"{field_name}": ({new_x}, {new_y})'
    
    import re
    new_content = re.sub(pattern, replacement, content)
    
    if new_content == content:
        print(f"⚠️  Could not find pattern for {field_name}")
        print(f"   Current pattern: {pattern}")
        return False
    
    # Write updated file
    with open(lambda_file, 'w') as f:
        f.write(new_content)
    
    print(f"✅ Updated {field_name}: ({new_x}, {new_y})")
    return True

def interactive_adjust():
    """Interactive coordinate adjustment"""
    print("\n" + "="*70)
    print("SS-4 COORDINATE ADJUSTMENT TOOL")
    print("="*70)
    print("\nThis tool helps you adjust misaligned field coordinates.")
    print("Use the merged PDF to identify which fields need adjustment.")
    print("\nTo adjust a field:")
    print("  1. Look at the merged PDF (ss4_with_coordinates.pdf)")
    print("  2. Identify the field that's misaligned")
    print("  3. Note the correct X, Y coordinates from the grid")
    print("  4. Enter the field name and new coordinates below")
    print("\nType 'done' when finished, or 'show' to see current coordinates")
    print("="*70)
    
    show_current_coordinates()
    
    while True:
        print("\n" + "-"*70)
        field_type = input("\nAdjust (t)ext field or (c)heckbox? [t/c/show/done]: ").strip().lower()
        
        if field_type == 'done':
            break
        elif field_type == 'show':
            show_current_coordinates()
            continue
        elif field_type not in ['t', 'c']:
            print("❌ Invalid choice. Use 't' for text field, 'c' for checkbox, 'show', or 'done'")
            continue
        
        is_checkbox = (field_type == 'c')
        
        if is_checkbox:
            print("\nAvailable checkboxes:")
            for cb in sorted(CHECK_COORDS.keys()):
                print(f"  - {cb}")
        else:
            print("\nAvailable text fields:")
            for field in sorted(FIELD_COORDS.keys()):
                print(f"  - {field}")
        
        field_name = input("\nEnter field name: ").strip()
        
        if not field_name:
            continue
        
        if is_checkbox:
            if field_name not in CHECK_COORDS:
                print(f"❌ Checkbox '{field_name}' not found")
                continue
        else:
            if field_name not in FIELD_COORDS:
                print(f"❌ Field '{field_name}' not found")
                continue
        
        try:
            new_x = int(input("Enter new X coordinate: ").strip())
            new_y = int(input("Enter new Y coordinate: ").strip())
        except ValueError:
            print("❌ Invalid coordinates. Must be integers.")
            continue
        
        if update_coordinate(field_name, new_x, new_y, is_checkbox):
            print(f"\n✅ Updated! Re-run verification to see changes:")
            print(f"   python3 scripts/verify-ss4-coordinates.py")
            print(f"   python3 scripts/merge-overlay-simple.py test-results/ss4_template_irs.pdf test-results/ss4_coordinate_overlay.pdf test-results/ss4_with_coordinates.pdf")

def batch_update_from_file(updates_file):
    """Update multiple coordinates from a JSON file"""
    if not os.path.exists(updates_file):
        print(f"❌ Updates file not found: {updates_file}")
        return False
    
    with open(updates_file, 'r') as f:
        updates = json.load(f)
    
    success_count = 0
    for update in updates:
        field_name = update.get('field')
        new_x = update.get('x')
        new_y = update.get('y')
        is_checkbox = update.get('checkbox', False)
        
        if update_coordinate(field_name, new_x, new_y, is_checkbox):
            success_count += 1
    
    print(f"\n✅ Updated {success_count}/{len(updates)} coordinates")
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--batch':
        # Batch update from JSON file
        updates_file = sys.argv[2] if len(sys.argv) > 2 else 'coordinate_updates.json'
        batch_update_from_file(updates_file)
    else:
        # Interactive mode
        interactive_adjust()

