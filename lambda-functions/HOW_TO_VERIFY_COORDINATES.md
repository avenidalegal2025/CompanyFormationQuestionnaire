# How to Verify and Adjust SS-4 PDF Field Coordinates

## Quick Start

I've created automated tools to help you verify the PDF field coordinates. Here's how to use them:

## Step 1: Generate Verification Files

```bash
python3 scripts/verify-ss4-coordinates.py
```

This creates:
- `test-results/ss4_coordinate_overlay.pdf` - Shows all field positions with coordinates
- `test-results/test_overlay.pdf` - Test filled form overlay

## Step 2: Merge with Template PDF

```bash
python3 scripts/merge-ss4-test.py
```

This will:
1. Download the SS-4 template from S3
2. Merge it with the coordinate overlay
3. Create `test-results/ss4_with_coordinates.pdf` - Visual verification PDF

## Step 3: Visual Verification

Open `test-results/ss4_with_coordinates.pdf` and check:
- ✅ Red circles show where text fields are positioned
- ✅ Green squares show where checkboxes are positioned
- ✅ Coordinate grid helps identify exact positions

## Step 4: Adjust Coordinates (if needed)

If fields don't align:

1. Open the SS-4 template PDF in a PDF editor (Adobe Acrobat, PDFtk, etc.)
2. Click on each field to see its coordinates
3. Update `FIELD_COORDS` and `CHECK_COORDS` in `lambda-functions/ss4_lambda_s3_complete.py`

### Example Adjustment

If "Line 1" (Legal name) is off by 10 pixels to the right:

```python
# Before
"Line 1": (65, 690),

# After
"Line 1": (75, 690),  # Moved 10 pixels right
```

## Step 5: Test with Real Data

```bash
python3 scripts/test-ss4-mappings.py
```

This tests all scenarios:
- LLC with owner SSN
- LLC without owner SSN
- Corporation
- Multiple members

## Step 6: Generate Test PDF

After adjusting coordinates, generate a test PDF:

```python
# In Python
from lambda_functions.ss4_lambda_s3_complete import map_data_to_ss4_fields, create_overlay
from PyPDF2 import PdfReader, PdfWriter

# Your test data
form_data = {...}

# Map and create overlay
mapped = map_data_to_ss4_fields(form_data)
create_overlay(mapped, "test_overlay.pdf")

# Merge with template
template = PdfReader("ss4_template.pdf")
overlay = PdfReader("test_overlay.pdf")
writer = PdfWriter()
page = template.pages[0]
page.merge_page(overlay.pages[0])
writer.add_page(page)

with open("test_filled.pdf", "wb") as f:
    writer.write(f)
```

## Alternative: Use PDF Form Field Inspector

If you have Adobe Acrobat Pro:

1. Open SS-4 template PDF
2. Go to Tools → Prepare Form
3. Click on each field to see its properties
4. Note the X, Y coordinates from the Properties panel
5. Update coordinates in Lambda function

## Current Field Coordinates

All current coordinates are in:
- `lambda-functions/ss4_lambda_s3_complete.py`
- `FIELD_COORDS` dictionary (text fields)
- `CHECK_COORDS` dictionary (checkboxes)

## Tips

1. **PDF coordinates start from bottom-left** (0,0) at bottom-left corner
2. **ReportLab coordinates** also start from bottom-left
3. **Y-axis is inverted** in some PDF tools (top = 0) vs ReportLab (bottom = 0)
4. **Test incrementally** - adjust one field at a time
5. **Use the grid overlay** to see exact pixel positions

## Troubleshooting

### Fields are too high/low
- Adjust Y coordinate (increase = move up, decrease = move down)

### Fields are too left/right  
- Adjust X coordinate (increase = move right, decrease = move left)

### Text is cut off
- Field might be too narrow, adjust X position or truncate text

### Checkboxes don't align
- Checkbox positions are more critical - use exact coordinates
- Some PDFs have checkboxes as form fields, others as graphics

## Need Help?

If coordinates are way off:
1. Check if PDF template version matches
2. Verify coordinate system (bottom-left vs top-left)
3. Use PDF form field inspector to get exact positions
4. Test with one field first, then expand

