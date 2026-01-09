#!/usr/bin/env python3
"""Test script to draw signature text at multiple Y positions to find correct coordinates"""

from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import tempfile
import os

# Test coordinates - try multiple Y positions
TEST_POSITIONS = [
    (77, 200, "Y=200 (higher)"),
    (77, 150, "Y=150 (medium-high)"),
    (77, 126, "Y=126 (current)"),
    (77, 100, "Y=100 (lower)"),
    (77, 80, "Y=80 (very low)"),
    (77, 65, "Y=65 (like SS-4)"),
]

def create_test_overlay():
    """Create overlay with signature text at multiple positions"""
    tmpdir = tempfile.gettempdir()
    overlay_path = os.path.join(tmpdir, "test_signature_overlay.pdf")
    
    c = canvas.Canvas(overlay_path, pagesize=(612, 792))
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)
    
    # Page 1 - just a marker
    c.drawString(77, 700, "PAGE 1 - TEST SIGNATURE COORDINATES")
    c.showPage()
    
    # Page 2 - Draw signature at multiple positions
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)
    
    # Draw test text at each position
    for x, y, label in TEST_POSITIONS:
        test_text = f"TEST NAME AT {label}"
        c.drawString(x, y, test_text)
        # Also draw a small marker
        c.setFont("Helvetica", 6)
        c.drawString(x + 200, y, f"← {label}")
        c.setFont("Helvetica", 9)
    
    # Draw the actual signature text at current position
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(1, 0, 0)  # Red to make it stand out
    c.drawString(77, 126, "JOHN SMITH TEST, SOLE MEMBER (CURRENT POS)")
    c.drawString(447, 126, "SOLE MEMBER (CURRENT POS)")
    
    c.save()
    print(f"✅ Test overlay created: {overlay_path}")
    return overlay_path

if __name__ == "__main__":
    overlay = create_test_overlay()
    print(f"\n📄 Test overlay saved to: {overlay}")
    print(f"📥 Copy to Downloads: cp {overlay} ~/Downloads/test-8821-coordinates.pdf")

