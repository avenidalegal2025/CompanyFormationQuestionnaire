#!/usr/bin/env python3
"""Test script to merge signature text with actual 8821 template at multiple positions"""

from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import tempfile
import os
import boto3

# Test coordinates - try multiple Y positions
TEST_POSITIONS = [
    (77, 200, "Y=200"),
    (77, 150, "Y=150"),
    (77, 126, "Y=126 (current)"),
    (77, 100, "Y=100"),
    (77, 80, "Y=80"),
    (77, 65, "Y=65"),
]

def download_template():
    """Download 8821 template from S3"""
    s3 = boto3.client('s3', region_name='us-west-1')
    tmpdir = tempfile.gettempdir()
    template_path = os.path.join(tmpdir, "f8821_template.pdf")
    
    try:
        s3.download_file('ss4-template-bucket-043206426879', 'f8821.pdf', template_path)
        print(f"✅ Downloaded template: {template_path}")
        return template_path
    except Exception as e:
        print(f"❌ Error downloading template: {e}")
        return None

def create_test_overlay():
    """Create overlay with signature text at multiple positions"""
    tmpdir = tempfile.gettempdir()
    overlay_path = os.path.join(tmpdir, "test_signature_overlay_merge.pdf")
    
    c = canvas.Canvas(overlay_path, pagesize=(612, 792))
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)
    
    # Page 1 - just skip (we only care about page 2)
    c.showPage()
    
    # Page 2 - Draw signature at multiple positions with labels
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)
    
    # Draw test text at each position
    for x, y, label in TEST_POSITIONS:
        test_text = f"TEST NAME {label}"
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(1, 0, 0)  # Red
        c.drawString(x, y, test_text)
        c.setFont("Helvetica", 6)
        c.drawString(x + 150, y, f"← {label}")
    
    # Draw the actual signature text at current position in BLACK
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)  # Black
    c.drawString(77, 126, "JOHN SMITH TEST, SOLE MEMBER")
    c.drawString(447, 126, "SOLE MEMBER")
    
    # Also try at Y=65 (like SS-4)
    c.drawString(77, 65, "JOHN SMITH TEST, SOLE MEMBER (Y=65)")
    c.drawString(447, 65, "SOLE MEMBER (Y=65)")
    
    c.save()
    print(f"✅ Test overlay created: {overlay_path}")
    return overlay_path

def merge_pdfs(template_path, overlay_path, output_path):
    """Merge template with overlay"""
    base = PdfReader(template_path)
    overlay = PdfReader(overlay_path)
    writer = PdfWriter()
    
    # Merge pages
    for i in range(len(base.pages)):
        page = base.pages[i]
        if i < len(overlay.pages):
            page.merge_page(overlay.pages[i])
        writer.add_page(page)
    
    with open(output_path, 'wb') as f:
        writer.write(f)
    
    print(f"✅ Merged PDF created: {output_path}")

if __name__ == "__main__":
    template = download_template()
    if template:
        overlay = create_test_overlay()
        tmpdir = tempfile.gettempdir()
        output_path = os.path.join(tmpdir, "test_8821_merged.pdf")
        merge_pdfs(template, overlay, output_path)
        print(f"\n📄 Merged test PDF: {output_path}")
        print(f"📥 Copy to Downloads: cp {output_path} ~/Downloads/test-8821-merged.pdf")
    else:
        print("❌ Could not download template")

