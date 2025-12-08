# How to Verify SS-4 Field Coordinates

You're viewing the coordinate overlay that shows where all fields are positioned. To verify they're correct, you need to compare it with the actual SS-4 template PDF.

## What You're Looking At

- **Red circles** = Text field positions (company name, addresses, SSN, etc.)
- **Green squares** = Checkbox positions (entity type, LLC status, etc.)
- **Blue grid** = Coordinate system (helps identify exact pixel positions)

## Next Steps

### Step 1: Get the SS-4 Template PDF

**Option A: Download from S3 (if you have AWS access)**
```bash
aws s3 cp s3://ss4-template-bucket-043206426879/fss4.pdf test-results/ss4_template.pdf
```

**Option B: If you have it locally**
Place it in `test-results/ss4_template.pdf` or provide the path when merging.

**Option C: Download from IRS website**
The official SS-4 form is available at: https://www.irs.gov/pub/irs-pdf/fss4.pdf

### Step 2: Merge with Overlay

Once you have the template:
```bash
./scripts/merge-with-local-template.sh
```

Or if you have it in a different location:
```bash
./scripts/merge-with-local-template.sh /path/to/your/ss4_template.pdf
```

### Step 3: Compare and Verify

Open the merged PDF (`test-results/ss4_with_coordinates.pdf`) and check:

1. **Text Fields**: Red circles should be positioned where text should appear
   - Line 1 (Legal name) should be at the top
   - Line 7a (Responsible party name) should be in the middle
   - Line 7b (SSN) should be next to the name field

2. **Checkboxes**: Green squares should align with checkbox positions
   - Line 8a (Is this a LLC?) should be near the LLC question
   - Line 9a (Entity type) should be in the entity type section

3. **If fields are misaligned**: Note the offset and update coordinates in `lambda-functions/ss4_lambda_s3_complete.py`

## Quick Test

If you want to test without the template, you can:
1. Generate a test SS-4 from Airtable (if you have a record)
2. Compare the generated PDF with a manually filled one
3. Adjust coordinates based on differences

## Current Field Positions

All coordinates are defined in:
- `lambda-functions/ss4_lambda_s3_complete.py`
- `FIELD_COORDS` dictionary (text fields)
- `CHECK_COORDS` dictionary (checkboxes)

