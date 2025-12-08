#!/usr/bin/env python3
"""
Merge test overlay with SS-4 template to create a visual verification PDF
"""

import sys
import os
import tempfile
import boto3
from PyPDF2 import PdfReader, PdfWriter

def download_template():
    """Download SS-4 template from S3"""
    bucket = 'ss4-template-bucket-043206426879'
    key = 'fss4.pdf'
    
    print(f"📥 Downloading template from s3://{bucket}/{key}...")
    
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

def merge_pdfs(template_path, overlay_path, output_path):
    """Merge template PDF with overlay"""
    print(f"\n🔗 Merging template with overlay...")
    
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
        return False

def main():
    print("🔗 SS-4 Template Merger")
    print("=" * 60)
    
    # Paths
    test_results_dir = os.path.join(os.path.dirname(__file__), '..', 'test-results')
    overlay_path = os.path.join(test_results_dir, 'ss4_coordinate_overlay.pdf')
    test_overlay_path = os.path.join(tempfile.gettempdir(), 'test_overlay.pdf')
    
    if not os.path.exists(overlay_path):
        print(f"❌ Overlay not found: {overlay_path}")
        print("💡 Run verify-ss4-coordinates.py first")
        return
    
    # Download template
    template_path = download_template()
    if not template_path:
        print("\n💡 You can manually download the template and provide the path")
        template_path = input("Enter path to SS-4 template PDF (or press Enter to skip): ").strip()
        if not template_path or not os.path.exists(template_path):
            print("❌ Template not found")
            return
    
    # Merge coordinate overlay
    output_path = os.path.join(test_results_dir, 'ss4_with_coordinates.pdf')
    if merge_pdfs(template_path, overlay_path, output_path):
        print(f"\n✅ View the merged PDF: {output_path}")
        print("   This shows where all fields are positioned")
    
    # Merge test filled form if it exists
    if os.path.exists(test_overlay_path):
        test_output = os.path.join(test_results_dir, 'ss4_test_filled_merged.pdf')
        if merge_pdfs(template_path, test_overlay_path, test_output):
            print(f"✅ View test filled form: {test_output}")
            print("   This shows how the form looks when filled")

if __name__ == "__main__":
    main()

