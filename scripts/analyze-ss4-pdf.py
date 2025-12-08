#!/usr/bin/env python3
"""
Analyze SS-4 PDF template to extract field coordinates
This script downloads the PDF from S3 and analyzes it to find field positions
"""

import sys
import os
import tempfile
import boto3
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader

# Try to use pdfplumber for better text extraction
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False
    print("⚠️  pdfplumber not installed. Install with: pip install pdfplumber")
    print("   Falling back to PyPDF2 (limited functionality)")

def download_template_from_s3():
    """Download SS-4 template from S3"""
    bucket = 'ss4-template-bucket-043206426879'
    key = 'fss4.pdf'
    
    print(f"📥 Downloading s3://{bucket}/{key}...")
    
    s3 = boto3.client('s3')
    tmp_path = os.path.join(tempfile.gettempdir(), 'ss4_template.pdf')
    
    try:
        s3.download_file(bucket, key, tmp_path)
        print(f"✅ Downloaded to: {tmp_path}")
        return tmp_path
    except Exception as e:
        print(f"❌ Failed to download: {e}")
        print("💡 Make sure AWS credentials are configured")
        return None

def analyze_with_pdfplumber(pdf_path):
    """Analyze PDF using pdfplumber (better text extraction)"""
    if not HAS_PDFPLUMBER:
        return None
    
    print("\n🔍 Analyzing PDF with pdfplumber...")
    
    field_positions = {}
    checkbox_positions = {}
    
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]  # SS-4 is single page
        
        # Extract all text with positions
        print("\n📋 Found text elements:")
        for char in page.chars:
            text = char['text']
            x = char['x0']
            y = char['top']
            
            # Look for field labels
            if 'Legal name' in text or 'Line 1' in text:
                print(f"  Line 1 (Legal name) near: ({x}, {y})")
            elif 'Responsible party' in text:
                print(f"  Responsible party near: ({x}, {y})")
            elif 'SSN' in text or 'ITIN' in text:
                print(f"  SSN/ITIN field near: ({x}, {y})")
        
        # Extract form fields (if fillable)
        if hasattr(page, 'form_fields'):
            print("\n📝 Found form fields:")
            for field in page.form_fields:
                print(f"  {field.get('field_name', 'Unknown')}: {field.get('rect', 'No position')}")
        
        # Look for checkboxes (small squares)
        print("\n☑️  Looking for checkboxes...")
        # Checkboxes are usually small squares, look for them
        
    return field_positions, checkbox_positions

def analyze_with_pypdf2(pdf_path):
    """Analyze PDF using PyPDF2 (basic analysis)"""
    print("\n🔍 Analyzing PDF with PyPDF2...")
    
    reader = PdfReader(pdf_path)
    page = reader.pages[0]
    
    # Extract text to see what's on the page
    text = page.extract_text()
    
    print("\n📄 PDF Text Content (first 1000 chars):")
    print(text[:1000])
    
    # Try to find annotations (form fields)
    if '/Annots' in page:
        print("\n📝 Found annotations (form fields):")
        for annot in page['/Annots']:
            obj = annot.get_object()
            if '/T' in obj:  # Field name
                field_name = obj['/T']
                if '/Rect' in obj:  # Field position
                    rect = obj['/Rect']
                    print(f"  {field_name}: Rect = {rect}")
    
    return None, None

def create_test_overlay(pdf_path, output_path):
    """Create a test overlay with grid to help identify field positions"""
    print("\n🎨 Creating test overlay with coordinate grid...")
    
    c = canvas.Canvas(output_path)
    c.setFont("Helvetica", 8)
    
    # Draw grid lines every 50 points
    for x in range(0, 800, 50):
        c.line(x, 0, x, 800)
        c.drawString(x + 2, 790, str(x))
    
    for y in range(0, 800, 50):
        c.line(0, y, 800, y)
        c.drawString(2, y + 2, str(y))
    
    # Mark known approximate positions
    known_fields = {
        "Line 1 (Legal name)": (65, 690),
        "Line 7a (Responsible party)": (65, 570),
        "Line 7b (SSN)": (342, 570),
        "Designee Name": (100, 115),
    }
    
    c.setFont("Helvetica-Bold", 10)
    for name, (x, y) in known_fields.items():
        c.circle(x, y, 5, fill=1)  # Mark position
        c.drawString(x + 10, y, name)
    
    c.save()
    print(f"✅ Test overlay saved to: {output_path}")
    print("💡 Merge this with the PDF template to see coordinate grid")

def main():
    print("🔍 SS-4 PDF Template Analyzer")
    print("=" * 60)
    
    # Download template
    pdf_path = download_template_from_s3()
    if not pdf_path:
        print("\n❌ Cannot proceed without PDF template")
        print("💡 You can manually download it from S3 or provide a local path")
        return
    
    # Analyze with best available method
    if HAS_PDFPLUMBER:
        field_pos, checkbox_pos = analyze_with_pdfplumber(pdf_path)
    else:
        field_pos, checkbox_pos = analyze_with_pypdf2(pdf_path)
    
    # Create test overlay
    overlay_path = os.path.join(tempfile.gettempdir(), 'ss4_test_overlay.pdf')
    create_test_overlay(pdf_path, overlay_path)
    
    print("\n" + "=" * 60)
    print("📋 Next Steps:")
    print("1. Open the test overlay PDF to see coordinate grid")
    print("2. Open the SS-4 template PDF")
    print("3. Compare field positions and update FIELD_COORDS in Lambda function")
    print("4. Use a PDF editor to click on fields and see their coordinates")
    print("\n💡 Tip: Use Adobe Acrobat or PDFtk to inspect form field coordinates")

if __name__ == "__main__":
    main()

