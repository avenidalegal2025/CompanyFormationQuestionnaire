# SS-4 Lambda Function Updates Summary

## Changes Made

### 1. Coordinate Adjustments ✅
- **Line 2**: Moved down 25 pixels (Y: 700 → 725)
- **Line 3**: Moved down to same level as Line 1 (Y: 700 → 690)

### 2. All Text in UPPERCASE ✅
- All text fields now convert to uppercase automatically
- Company name, addresses, names, business purpose - everything is ALL CAPS
- Applied in both `map_data_to_ss4_fields()` and `create_overlay()` functions

### 3. Address Field Mapping ✅

**Line 1**: Full company name including suffix (LLC, L.L.C., Inc, etc.) - ALL CAPS

**Line 3**: Company's street address line 1 (same as Line 5a) - ALL CAPS

**Line 4a**: Fixed to "12550 BISCAYNE BLVD STE 110" (Avenida Legal mailing address) - ALL CAPS

**Line 4b**: Fixed to "MIAMI, FL, 33181" (Avenida Legal mailing address) - ALL CAPS

**Line 5a**: Company's US street address line 1 - ALL CAPS

**Line 5b**: Company's US street address line 2 (if exists) - ALL CAPS

**Line 6**: Company's US City and State (format: "CITY, STATE") - ALL CAPS

**Line 7a**: Responsible party name - ALL CAPS

**Line 7b**: Responsible party SSN/ITIN/EIN - ALL CAPS

### 4. Line 8b Logic ✅
- For LLCs: Shows number of LLC members
- For non-LLCs: Shows date business started

### 5. Other Fields ✅
- Line 9b: State of incorporation (for corps) - ALL CAPS
- Line 11: Business purpose - ALL CAPS
- Designee Name: "AVENIDA LEGAL" - ALL CAPS
- Designee Address: "12550 BISCAYNE BLVD STE 110, NORTH MIAMI, FL 33181" - ALL CAPS
- Signature Name: Responsible party name - ALL CAPS

## Testing

To verify the changes:

```bash
# Regenerate coordinate overlay
python3 scripts/verify-ss4-coordinates.py

# Merge with template
python3 scripts/merge-overlay-simple.py test-results/ss4_template_irs.pdf test-results/ss4_coordinate_overlay.pdf test-results/ss4_with_coordinates.pdf

# View result
open test-results/ss4_with_coordinates.pdf
```

## Next Steps

1. ✅ Coordinates adjusted (Line 2, Line 3)
2. ✅ All text converted to uppercase
3. ✅ Address fields mapped correctly
4. ⏳ Test with real Airtable data
5. ⏳ Deploy to AWS Lambda

## Files Modified

- `lambda-functions/ss4_lambda_s3_complete.py`
  - Updated `FIELD_COORDS` (Line 2, Line 3 positions)
  - Updated `map_data_to_ss4_fields()` (address parsing, uppercase conversion)
  - Updated `create_overlay()` (uppercase conversion for all text)

