#!/usr/bin/env python3
"""
Interactive script to verify and adjust SS-4 field coordinates
Creates a visual overlay to help identify correct positions
"""

import sys
import os
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.colors import red, blue, green

# Add lambda-functions to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lambda-functions'))
from ss4_lambda_s3_complete import FIELD_COORDS, CHECK_COORDS

def create_verification_overlay(output_path):
    """Create an overlay showing all field positions for verification"""
    print("🎨 Creating verification overlay...")
    
    c = canvas.Canvas(output_path)
    c.setFont("Helvetica", 7)
    
    # Draw coordinate grid
    for x in range(0, 800, 25):
        c.setStrokeColor(blue, alpha=0.3)
        c.line(x, 0, x, 800)
        if x % 100 == 0:
            c.setFillColor(blue)
            c.drawString(x + 1, 790, str(x))
    
    for y in range(0, 800, 25):
        c.setStrokeColor(blue, alpha=0.3)
        c.line(0, y, 800, y)
        if y % 100 == 0:
            c.setFillColor(blue)
            c.drawString(1, y + 1, str(y))
    
    # Mark text field positions
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(red)
    
    print("\n📝 Text Fields:")
    for field_name, (x, y) in FIELD_COORDS.items():
        # Draw circle at position
        c.circle(x, y, 3, fill=1)
        # Draw label
        c.setFillColor(red)
        c.drawString(x + 5, y + 2, f"{field_name}: ({x}, {y})")
        print(f"  {field_name:20s} → ({x:3d}, {y:3d})")
    
    # Mark checkbox positions
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(green)
    
    print("\n☑️  Checkboxes:")
    for check_name, coords in CHECK_COORDS.items():
        if isinstance(coords, list) and len(coords) >= 2:
            x, y = coords[0], coords[1]
            # Draw square at position
            c.rect(x - 2, y - 2, 4, 4, fill=1)
            # Draw label
            c.setFillColor(green)
            c.drawString(x + 5, y + 2, f"{check_name}: ({x}, {y})")
            print(f"  {check_name:20s} → ({x:3d}, {y:3d})")
    
    # Add instructions
    c.setFont("Helvetica", 10)
    c.setFillColor(blue)
    c.drawString(10, 10, "Instructions: Merge this overlay with SS-4 template PDF to verify field positions")
    c.drawString(10, 25, "Red circles = Text fields, Green squares = Checkboxes")
    
    c.save()
    print(f"\n✅ Verification overlay saved to: {output_path}")
    print("\n💡 Next steps:")
    print("   1. Open the SS-4 template PDF")
    print("   2. Open this overlay PDF")
    print("   3. Compare positions - adjust coordinates if needed")
    print("   4. Update FIELD_COORDS and CHECK_COORDS in ss4_lambda_s3_complete.py")

def create_test_filled_form(sample_data, output_path):
    """Create a test filled form to verify all fields are in correct positions"""
    print("\n📄 Creating test filled SS-4 form...")
    
    from ss4_lambda_s3_complete import map_data_to_ss4_fields, create_overlay
    
    # Map sample data
    mapped_data = map_data_to_ss4_fields(sample_data)
    
    # Create overlay
    overlay_path = os.path.join(tempfile.gettempdir(), 'test_overlay.pdf')
    create_overlay(mapped_data, overlay_path)
    
    print(f"✅ Test overlay created: {overlay_path}")
    print("💡 Merge this with SS-4 template to see filled form")
    print("   If fields don't align, adjust coordinates in Lambda function")

if __name__ == "__main__":
    print("🔍 SS-4 Coordinate Verification Tool")
    print("=" * 60)
    
    output_dir = os.path.join(os.path.dirname(__file__), '..', 'test-results')
    os.makedirs(output_dir, exist_ok=True)
    
    # Create verification overlay
    overlay_path = os.path.join(output_dir, 'ss4_coordinate_overlay.pdf')
    create_verification_overlay(overlay_path)
    
    # Create test filled form
    sample_data = {
        "companyName": "Test Company LLC",
        "companyNameBase": "Test Company",
        "entityType": "LLC",
        "formationState": "Florida",
        "businessPurpose": "Real estate investment",
        "companyAddress": "123 Main St, Miami, FL 33101",
        "responsiblePartyName": "John Doe",
        "responsiblePartySSN": "123-45-6789",
        "responsiblePartyAddress": "456 Ocean Dr, Miami, FL 33139",
        "responsiblePartyCity": "Miami",
        "responsiblePartyState": "FL",
        "responsiblePartyZip": "33139",
        "responsiblePartyCountry": "USA",
        "ownerCount": 1,
        "isLLC": "Yes",
        "llcMemberCount": 1,
        "dateBusinessStarted": "2024-01-15"
    }
    
    test_form_path = os.path.join(output_dir, 'ss4_test_filled.pdf')
    create_test_filled_form(sample_data, test_form_path)
    
    print("\n" + "=" * 60)
    print("✅ Verification files created in test-results/")
    print("   - ss4_coordinate_overlay.pdf (shows all field positions)")
    print("   - test_overlay.pdf (test filled form overlay)")

