#!/usr/bin/env python3
"""Find correct coordinates for signature name and title on Form 8821"""

from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import tempfile
import os
import boto3

# Test a wide range of Y coordinates - signature section is at bottom of page 2
# Form 8821 page is 792 pixels tall, signature section is near bottom
TEST_Y_POSITIONS = [
    180,  # Higher up
    160,  # 
    140,  # 
    130,  # 
    120,  # 
    110,  # 
    100,  # 
    90,   # 
    80,   # 
    70,   # 
    65,   # Like SS-4
    60,   # 
    55,   # 
    50,   # Very low
]

def download_template():
    """Download 8821 template from S3"""
    s3 = boto3.client('s3', region_name='us-west-1')
    tmpdir = tempfile.gettempdir()
    template_path = os.path.join(tmpdir, "f8821_template_coords.pdf")
    
    try:
        s3.download_file('ss4-template-bucket-043206426879', 'f8821.pdf', template_path)
        return template_path
    except Exception as e:
        print(f"❌ Error downloading template: {e}")
        return None

def create_test_overlay():
    """Create overlay with signature text at multiple Y positions"""
    tmpdir = tempfile.gettempdir()
    overlay_path = os.path.join(tmpdir, "test_coords_overlay.pdf")
    
    c = canvas.Canvas(overlay_path, pagesize=(612, 792))
    
    # Page 1 - skip
    c.showPage()
    
    # Page 2 - Draw signature at multiple Y positions
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(1, 0, 0)  # Red for visibility
    
    # Draw name at different Y positions
    for y in TEST_Y_POSITIONS:
        c.drawString(77, y, f"NAME Y={y}")
        c.drawString(447, y, f"TITLE Y={y}")
    
    # Also draw in black at current position
    c.setFillColorRGB(0, 0, 0)  # Black
    c.drawString(77, 126, "CURRENT: JOHN SMITH TEST, SOLE MEMBER")
    c.drawString(447, 126, "CURRENT: SOLE MEMBER")
    
    c.save()
    return overlay_path

def merge_pdfs(template_path, overlay_path, output_path):
    """Merge template with overlay"""
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
    print("🔍 Finding correct coordinates for Form 8821 signature fields...")
    template = download_template()
    if template:
        overlay = create_test_overlay()
        tmpdir = tempfile.gettempdir()
        output_path = os.path.join(tmpdir, "find_8821_coords.pdf")
        merge_pdfs(template, overlay, output_path)
        
        downloads_path = os.path.expanduser("~/Downloads/find-8821-coords.pdf")
        os.system(f"cp {output_path} {downloads_path}")
        print(f"✅ Test PDF saved to: {downloads_path}")
        print(f"📋 Check page 2 and find which Y position aligns with 'Print Name' and 'Title' fields")
        print(f"   Red text shows different Y positions, black text shows current (Y=126)")
        os.system(f"open {downloads_path}")
    else:
        print("❌ Could not download template")

