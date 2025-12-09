# SS-4 Field Mapping Verification

## Complete Data Flow Trace

### 1. API → Lambda (Field Names)

| API Field Name | Lambda Receives | Lambda Maps To | SS-4 Field | Coordinates |
|----------------|-----------------|----------------|------------|-------------|
| `summarizedBusinessPurpose` | ✅ `form_data.get("summarizedBusinessPurpose")` | `"10"` | Line 10 text | (65, 375) |
| `paymentDate` | ✅ `form_data.get("paymentDate")` | `"11"` | Line 11 text | (115, 317) |
| (hardcoded) | N/A | `"12"` = "DECEMBER" | Line 12 text | (290, 400) |
| (hardcoded) | N/A | `"15"` = "N/A" | Line 15 text | (400, 232) |
| `line17PrincipalMerchandise` | ✅ `form_data.get("line17PrincipalMerchandise")` | `"17"` | Line 17 text | (65, 172) |
| `signatureName` | ✅ `form_data.get("signatureName")` | `"Signature Name"` | Signature | (150, 65) |
| `applicantPhone` | ✅ `form_data.get("applicantPhone")` | `"Applicant Phone"` | Applicant Phone | (450, 65) |
| (hardcoded) | N/A | `"Designee Name"` = format_designee_name() | Designee Name | (100, 115) |
| (hardcoded) | N/A | `"Designee Address"` = "10634 NE 11 AVE..." | Designee Address | (100, 90) |
| (hardcoded) | N/A | `"Designee Phone"` = "(786) 512-0434" | Designee Phone | (450, 112) |
| (hardcoded) | N/A | `"Designee Fax"` = "866-496-4957" | Designee Fax | (450, 90) |
| `line16Category` | ✅ `form_data.get("line16Category")` | `Checks["16_*"]` | Line 16 checkbox | Various |
| (always set) | N/A | `Checks["10_started"]` | Line 10 checkbox | (63, 388) |
| (always set) | N/A | `Checks["14_no_employees"]` | Line 14 checkbox | (407, 256) |
| (always set) | N/A | `Checks["18_no"]` | Line 18 checkbox | (402, 160) |

### 2. Verification Results

✅ **Line 10**: API sends `summarizedBusinessPurpose` → Lambda maps to `"10"` → Draws at (65, 375)
✅ **Line 11**: API sends `paymentDate` → Lambda maps to `"11"` → Draws at (115, 317)
✅ **Line 12**: Hardcoded "DECEMBER" → Lambda maps to `"12"` → Draws at (290, 400)
✅ **Line 15**: Hardcoded "N/A" → Lambda maps to `"15"` → Draws at (400, 232)
✅ **Line 17**: API sends `line17PrincipalMerchandise` → Lambda maps to `"17"` → Draws at (65, 172)
✅ **Signature Name**: API sends `signatureName` → Lambda maps to `"Signature Name"` → Draws at (150, 65)
✅ **Designee fields**: All hardcoded correctly
✅ **Checkboxes**: All set correctly in `Checks` dictionary

### 3. Potential Issues

⚠️ **Field Drawing Logic**: The code checks `if value:` before drawing. For fields like "15" which should always be "N/A", this is handled with special logic.

⚠️ **Empty String Handling**: If `applicantPhone` is empty string, it won't be drawn. This might be intentional.

✅ **Checkbox Drawing**: Checkboxes are drawn in the general loop AND special handling. This is redundant but shouldn't cause issues.

### 4. Conclusion

**The code IS wired correctly** based on static analysis. However, runtime verification is needed to confirm:
1. Data actually reaches Lambda (check CloudWatch logs)
2. Fields are actually drawn (check PDF output)
3. Coordinates are correct (check PDF output)

