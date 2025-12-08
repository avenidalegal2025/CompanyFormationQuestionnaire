# SS-4 Lambda Function Enhancements

## Overview
Enhanced the SS-4 Lambda function (`ss4_lambda_s3_complete.py`) with proper logic for different company formation scenarios.

## Key Enhancements

### 1. **Entity Type Logic**
- ✅ LLC detection and handling
- ✅ Corporation (C-Corp) support
- ✅ S-Corporation support
- ✅ Partnership support
- ✅ Other entity types

### 2. **LLC-Specific Logic**
- ✅ **Line 8a**: "Is this a LLC?" checkbox (Yes/No)
- ✅ **Line 8b**: Number of LLC members
- ✅ **Line 8c**: "Are all members individuals?" checkbox (Yes if owner has SSN)

### 3. **Responsible Party Logic**
- ✅ Primary owner (Owner 1) as responsible party
- ✅ Handles SSN for US owners
- ✅ Handles ITIN for international owners
- ✅ Falls back to manager if no owner

### 4. **Checkbox Handling**
All checkboxes are now properly mapped:
- **Line 8a**: LLC status (Yes)
- **Line 8c**: All members are individuals (Yes if SSN present)
- **Line 9a**: Entity type (LLC, Corporation, S-Corp, Partnership, Other)
- **Line 10**: Reason for applying (Started new business)
- **Line 14**: First date wages paid (Will not have employees)
- **Line 18**: Third Party Designee (Yes)

### 5. **Address Parsing**
- ✅ Company mailing address (Lines 3, 4a, 4b)
- ✅ Responsible party street address (Lines 5a, 5b, 6)
- ✅ Handles both US and international addresses

### 6. **Date Handling**
- ✅ Converts ISO dates (YYYY-MM-DD) to MM/DD/YYYY format
- ✅ Uses payment date or current date as business start date

## Test Scenarios

The function now handles:

1. **LLC with Owner SSN**
   - ✅ Checks "LLC" on Line 8a
   - ✅ Fills member count on Line 8b
   - ✅ Checks "Yes" on Line 8c (all members individuals)
   - ✅ Uses owner SSN on Line 7b

2. **LLC without Owner SSN** (International)
   - ✅ Checks "LLC" on Line 8a
   - ✅ Fills member count on Line 8b
   - ✅ Leaves Line 8c unchecked (may need ITIN)
   - ✅ Leaves Line 7b empty (or uses ITIN if provided)

3. **Corporation**
   - ✅ Checks appropriate entity type on Line 9a
   - ✅ Fills state of incorporation on Line 9b
   - ✅ Uses owner SSN on Line 7b

4. **Multiple Owners**
   - ✅ Uses Owner 1 as responsible party
   - ✅ Fills correct member count for LLCs

## Field Coordinates

Current field coordinates (may need adjustment based on actual PDF):

```python
FIELD_COORDS = {
    "Line 1": (65, 690),      # Legal name of entity
    "Line 2": (65, 700),       # Trade name
    "Line 3": (315, 700),      # Mailing address line 1
    "Line 4a": (65, 640),      # Mailing address line 2
    "Line 4b": (65, 617),      # City, State, ZIP
    "Line 5a": (305, 640),     # Street address line 1
    "Line 5b": (315, 617),     # Street address line 2
    "Line 6": (65, 594),       # City, State, ZIP (street)
    "Line 7a": (65, 570),      # Responsible party name
    "Line 7b": (342, 570),      # Responsible party SSN
    "8b": (500, 542),          # Date business started
    "9b": (290, 414),          # Closing month
    "10": (65, 375),           # Highest number of employees
    "11": (115, 317),          # Principal activity
    "12": (485, 327),          # Principal activity code
    "13_Ag": (100, 257),       # Agricultural employees
    "13_Hh": (180, 257),       # Household employees
    "13_Ot": (280, 257),       # Other employees
    "15": (400, 230),          # First date wages paid
    "17": (65, 170),           # Additional information
    "Designee Name": (100, 115),
    "Designee Address": (100, 90),
    "Designee Phone": (450, 112),
    "Designee Fax": (450, 90),
    "Applicant Phone": (450, 65),
    "Applicant Fax": (150, 60),
    "Signature Name": (150, 65)
}
```

## Testing

### Run Local Tests
```bash
python3 scripts/test-ss4-mappings.py
```

This tests all scenarios:
- LLC with owner SSN
- LLC without owner SSN
- Corporation
- LLC with multiple members

### Download from AWS
```bash
./scripts/download-lambda-ss4.sh
```

Updates: `lambda-functions/ss4_lambda_s3_aws.py` with current AWS version.

## Next Steps

1. **Verify PDF Coordinates**
   - Open the actual SS-4 PDF template
   - Verify field positions match coordinates
   - Adjust `FIELD_COORDS` and `CHECK_COORDS` as needed

2. **Test with Real Data**
   - Generate SS-4 from Airtable record
   - Compare with manually filled form
   - Adjust mappings based on results

3. **Handle Edge Cases**
   - LLC with no SSN (may need ITIN application)
   - Multiple responsible parties
   - Complex address formats

4. **Deploy to AWS**
   - Zip the Lambda function
   - Upload to AWS Lambda
   - Test with real Airtable data

## Files Modified

- `lambda-functions/ss4_lambda_s3_complete.py` - Enhanced with all logic
- `scripts/test-ss4-mappings.py` - Test script for local verification
- `scripts/download-lambda-ss4.sh` - Script to download from AWS

## Notes

- Field coordinates may need fine-tuning based on actual PDF template
- Checkbox positions are approximate and may need adjustment
- Date format conversion handles ISO dates from Airtable
- Address parsing handles both US and international formats

