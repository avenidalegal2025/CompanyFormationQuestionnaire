# How to Fix Misaligned SS-4 Coordinates

## Quick Method: Interactive Tool

Run the interactive adjustment tool:

```bash
python3 scripts/adjust-ss4-coordinates.py
```

This will:
1. Show all current coordinates
2. Let you adjust fields one by one
3. Update the Lambda function automatically

## Step-by-Step Process

### 1. Identify Misaligned Fields

Open `test-results/ss4_with_coordinates.pdf` and identify which fields are misaligned:
- Red circles should be centered on text fields
- Green squares should be centered on checkboxes

### 2. Get Correct Coordinates

From the merged PDF:
- Use the blue grid to identify the correct X, Y position
- X increases going right
- Y increases going up (from bottom of page)

### 3. Update Coordinates

**Option A: Interactive Tool (Recommended)**
```bash
python3 scripts/adjust-ss4-coordinates.py
```

**Option B: Manual Edit**
Edit `lambda-functions/ss4_lambda_s3_complete.py`:

```python
# Text fields
FIELD_COORDS = {
    "Line 1": (65, 690),  # Change these numbers
    "Line 7a": (65, 570), # to match correct positions
    # ...
}

# Checkboxes
CHECK_COORDS = {
    "8a_yes": [257, 545],  # Change these numbers
    "9a": [64, 496],       # to match correct positions
    # ...
}
```

**Option C: Batch Update from JSON**
1. Create `coordinate_updates.json` (see template in `test-results/`)
2. Run: `python3 scripts/adjust-ss4-coordinates.py --batch coordinate_updates.json`

### 4. Verify Changes

After updating:
```bash
# Regenerate overlay
python3 scripts/verify-ss4-coordinates.py

# Merge with template
python3 scripts/merge-overlay-simple.py test-results/ss4_template_irs.pdf test-results/ss4_coordinate_overlay.pdf test-results/ss4_with_coordinates.pdf

# View result
open test-results/ss4_with_coordinates.pdf
```

## Common Adjustments

### If field is too far RIGHT:
- **Decrease X coordinate** (e.g., 75 → 65)

### If field is too far LEFT:
- **Increase X coordinate** (e.g., 65 → 75)

### If field is too HIGH:
- **Decrease Y coordinate** (e.g., 690 → 680)

### If field is too LOW:
- **Increase Y coordinate** (e.g., 680 → 690)

## Tips

1. **Adjust incrementally**: Change by 5-10 pixels at a time
2. **Test after each change**: Regenerate and verify
3. **Note the offset**: If a field is 10px too far right, subtract 10 from X
4. **Checkboxes are critical**: They need exact alignment
5. **Text fields have some tolerance**: But should still be close

## Example: Fixing "Line 1"

If "Line 1" (Legal name) is 10 pixels too far right:

1. Current: `"Line 1": (65, 690)`
2. Should be: `"Line 1": (55, 690)` (subtract 10 from X)
3. Update in `ss4_lambda_s3_complete.py`
4. Regenerate and verify

## Need Help?

If you're not sure about coordinates:
1. Use the grid overlay to count pixels
2. Or use a PDF editor (Adobe Acrobat) to inspect form fields
3. The coordinate system starts from bottom-left (0,0)

