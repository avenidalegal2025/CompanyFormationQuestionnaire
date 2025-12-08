#!/usr/bin/env python3
"""Simple script to merge overlay with template PDF"""

import sys
import os
from PyPDF2 import PdfReader, PdfWriter

def merge_pdfs(template_path, overlay_path, output_path):
    """Merge template PDF with overlay"""
    print(f"🔗 Merging {template_path} with {overlay_path}...")
    
    try:
        template = PdfReader(template_path)
        overlay = PdfReader(overlay_path)
        writer = PdfWriter()
        
        # Merge first page
        if len(template.pages) > 0 and len(overlay.pages) > 0:
            page = template.pages[0]
            page.merge_page(overlay.pages[0])
            writer.add_page(page)
        
        # Save merged PDF
        with open(output_path, 'wb') as f:
            writer.write(f)
        
        print(f"✅ Merged PDF saved to: {output_path}")
        return True
    except Exception as e:
        print(f"❌ Failed to merge: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    import sys
    
    # Allow template and overlay paths as arguments
    if len(sys.argv) >= 3:
        template_path = sys.argv[1]
        overlay_path = sys.argv[2]
        output_path = sys.argv[3] if len(sys.argv) > 3 else template_path.replace('.pdf', '_with_coordinates.pdf')
    else:
        base_dir = os.path.join(os.path.dirname(__file__), '..')
        test_results = os.path.join(base_dir, 'test-results')
        
        template_path = os.path.join(test_results, 'ss4_template.pdf')
        overlay_path = os.path.join(test_results, 'ss4_coordinate_overlay.pdf')
        output_path = os.path.join(test_results, 'ss4_with_coordinates.pdf')
    
    if not os.path.exists(template_path):
        print(f"❌ Template not found: {template_path}")
        sys.exit(1)
    
    if not os.path.exists(overlay_path):
        print(f"❌ Overlay not found: {overlay_path}")
        sys.exit(1)
    
    if merge_pdfs(template_path, overlay_path, output_path):
        print(f"\n✅ Success! Open the merged PDF:")
        print(f"   open {output_path}")
    else:
        sys.exit(1)

