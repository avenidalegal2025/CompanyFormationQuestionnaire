#!/usr/bin/env python3
"""Test ALL Y positions systematically to find correct coordinates"""

from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import tempfile
import os
import boto3

def download_template():
    s3 = boto3.client('s3', region_name='us-west-1')
    tmpdir = tempfile.gettempdir()
    template_path = os.path.join(tmpdir, "f8821_all_y.pdf")
    try:
        s3.download_file('ss4-template-bucket-043206426879', 'f8821.pdf', template_path)
        return template_path
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def create_overlay():
    tmpdir = tempfile.gettempdir()
    overlay_path = os.path.join(tmpdir, "all_y_overlay.pdf")
    c = canvas.Canvas(overlay_path, pagesize=(612, 792))
    
    # Page 1 - skip
    c.showPage()
    
    # Page 2 - Test EVERY Y position from 200 down to 30
    c.setFont("Helvetica", 9)
    
    # Test Y positions every 5 pixels
    for y in range(200, 29, -5):
        # Draw name at X=77
        c.setFillColorRGB(1, 0, 0)  # Red
        c.drawString(77, y, f"NAME Y={y}")
        
        # Draw title at X=447
        c.setFillColorRGB(0, 0, 1)  # Blue
        c.drawString(447, y, f"TITLE Y={y}")
    
    # Also test different X positions for name (maybe X is wrong too)
    c.setFillColorRGB(0, 1, 0)  # Green
    for x in [50, 70, 77, 100, 120, 150]:
        c.drawString(x, 80, f"X={x}")
    
    # Test different X positions for title
    c.setFillColorRGB(1, 0, 1)  # Magenta
    for x in [400, 420, 447, 450, 470, 500]:
        c.drawString(x, 80, f"X={x}")
    
    c.save()
    return overlay_path

def merge_pdfs(template_path, overlay_path, output_path):
    base = PdfReader(template_path)
    overlay = PdfReader(overlay_path)
    writer = PdfWriter()
    for i in range(len(base.pages)):
        page = base.pages[i]
        if i < len(overlay.pages):
            page.merge_page(overlay.pages[i])
        writer.add_page(page)
    with open(output_path, 'wb') as f:
        writer.write(f)

if __name__ == "__main__":
    print("🔍 Testing ALL Y positions (200 to 30, every 5px)...")
    template = download_template()
    if template:
        overlay = create_overlay()
        tmpdir = tempfile.gettempdir()
        output_path = os.path.join(tmpdir, "all_y_test.pdf")
        merge_pdfs(template, overlay, output_path)
        downloads_path = os.path.expanduser("~/Downloads/all-y-positions-test.pdf")
        os.system(f"cp {output_path} {downloads_path}")
        print(f"✅ Test PDF: {downloads_path}")
        print(f"📋 Red=Name candidates, Blue=Title candidates")
        print(f"   Green=Name X positions, Magenta=Title X positions")
        print(f"   Find which Y position aligns with 'Print Name' and 'Title' fields")
        os.system(f"open {downloads_path}")

