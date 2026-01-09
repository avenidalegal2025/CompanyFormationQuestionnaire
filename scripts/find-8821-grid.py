#!/usr/bin/env python3
"""Create a grid overlay to find exact coordinates for Print Name and Title fields"""

from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import tempfile
import os
import boto3

def download_template():
    """Download 8821 template from S3"""
    s3 = boto3.client('s3', region_name='us-west-1')
    tmpdir = tempfile.gettempdir()
    template_path = os.path.join(tmpdir, "f8821_grid_template.pdf")
    
    try:
        s3.download_file('ss4-template-bucket-043206426879', 'f8821.pdf', template_path)
        return template_path
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def create_grid_overlay():
    """Create overlay with grid to find exact coordinates"""
    tmpdir = tempfile.gettempdir()
    overlay_path = os.path.join(tmpdir, "grid_overlay.pdf")
    
    c = canvas.Canvas(overlay_path, pagesize=(612, 792))
    
    # Page 1 - skip
    c.showPage()
    
    # Page 2 - Create grid around signature area
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(1, 0, 0)  # Red
    
    # Test X positions for "Print Name" (likely left side, around 50-150)
    name_x_positions = [50, 70, 77, 90, 100, 110, 120, 130, 150]
    # Test Y positions (signature section is at bottom, likely 50-180)
    name_y_positions = [180, 160, 140, 120, 100, 80, 70, 65, 60, 55, 50]
    
    # Test X positions for "Title" (likely right side, around 350-500)
    title_x_positions = [350, 400, 447, 450, 470, 500]
    # Same Y positions for title
    
    # Draw grid for Print Name field
    for x in name_x_positions:
        for y in name_y_positions:
            c.drawString(x, y, f"X{x}Y{y}")
    
    # Draw grid for Title field
    c.setFillColorRGB(0, 0, 1)  # Blue for title
    for x in title_x_positions:
        for y in name_y_positions:
            c.drawString(x, y, f"X{x}Y{y}")
    
    # Highlight current position
    c.setFillColorRGB(0, 1, 0)  # Green
    c.setFont("Helvetica", 10)
    c.drawString(77, 126, "CURRENT NAME POS")
    c.drawString(447, 126, "CURRENT TITLE POS")
    
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
    print("🔍 Creating grid overlay to find exact coordinates...")
    template = download_template()
    if template:
        overlay = create_grid_overlay()
        tmpdir = tempfile.gettempdir()
        output_path = os.path.join(tmpdir, "grid_8821.pdf")
        merge_pdfs(template, overlay, output_path)
        
        downloads_path = os.path.expanduser("~/Downloads/grid-8821-coords.pdf")
        os.system(f"cp {output_path} {downloads_path}")
        print(f"✅ Grid test PDF saved to: {downloads_path}")
        print(f"📋 Red text = Name field candidates, Blue text = Title field candidates")
        print(f"   Green text = Current position (77, 126) and (447, 126)")
        print(f"   Find which coordinates align with 'Print Name' and 'Title' fields on the form")
        os.system(f"open {downloads_path}")
    else:
        print("❌ Could not download template")

