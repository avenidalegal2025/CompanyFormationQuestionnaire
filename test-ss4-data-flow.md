# SS-4 Data Flow Verification

## Data Flow Path

### 1. API Route (`generate-ss4/route.ts`)
- Sets: `ss4Data.summarizedBusinessPurpose` ✅
- Sets: `ss4Data.line16Category` ✅
- Sets: `ss4Data.line16OtherSpecify` ✅
- Sets: `ss4Data.line17PrincipalMerchandise` ✅
- Sets: `ss4Data.signatureName` (with ",SOLE MEMBER" or ",MEMBER") ✅
- Sets: `ss4Data.paymentDate` ✅
- Sets: `ss4Data.applicantPhone` ✅
- Calls: `callSS4Lambda(ss4Data, ...)` ✅

### 2. Lambda Handler (`ss4_lambda_s3_complete.py`)
- Receives: `form_data = body.get("form_data")` ✅
- Maps: `ss4_fields = map_data_to_ss4_fields(form_data)` ✅
- Creates: `create_overlay(ss4_fields, overlay_path)` ✅

### 3. Field Mapping (`map_data_to_ss4_fields`)
- Line 10: `form_data.get("summarizedBusinessPurpose", ...)` ✅
- Line 11: `form_data.get("dateBusinessStarted", form_data.get("paymentDate", ""))` ✅
- Line 12: `"DECEMBER"` (hardcoded) ✅
- Line 15: `"N/A"` (hardcoded) ✅
- Line 17: `form_data.get("line17PrincipalMerchandise", "")` ✅
- Designee Name: `format_designee_name(form_data, entity_type)` ✅
- Designee Address: `"10634 NE 11 AVE, MIAMI, FL, 33138"` (hardcoded) ✅
- Designee Phone: `"(786) 512-0434"` (hardcoded) ✅
- Designee Fax: `"866-496-4957"` (hardcoded) ✅
- Signature Name: `form_data.get("signatureName")` or `format_signature_name(...)` ✅
- Checks: Line 10, 14, 16, 18 ✅

### 4. Overlay Creation (`create_overlay`)
- Loops through `FIELD_COORDS` ✅
- Draws text fields if value exists ✅
- Draws checkboxes from `Checks` dictionary ✅

## Potential Issues to Check

1. **Field Name Mismatches**: 
   - API sends: `summarizedBusinessPurpose`
   - Lambda expects: `summarizedBusinessPurpose` ✅ MATCH
   
2. **Empty Values**:
   - Lambda checks `if value:` before drawing
   - This might skip fields with empty strings
   - **FIXED**: Now handles "15" = "N/A" correctly

3. **Checkbox Drawing**:
   - Checkboxes are drawn in general loop AND special handling
   - This is redundant but shouldn't cause issues

4. **Data Not Reaching Lambda**:
   - Need to check CloudWatch logs to verify

## Verification Steps

1. Check API logs to see what data is being sent
2. Check Lambda CloudWatch logs to see what data is received
3. Check Lambda logs to see which fields are being drawn
4. Verify the actual PDF output

