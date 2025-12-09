# Debugging SS-4 Generation Issues

## Problem
When creating a company from the questionnaire, many fields in the SS-4 PDF are empty, even though the test works correctly.

## Root Cause Analysis

### Test vs Real Flow
- **Test**: Directly calls Lambda with complete test data
- **Real Flow**: Questionnaire → Airtable → API → Lambda

### Potential Issues

1. **Airtable Fields Missing**
   - Check if Airtable record has all required fields populated
   - Key fields to verify:
     - `Company Name`
     - `Company Address` (full address with city, state, zip)
     - `Formation State`
     - `Business Purpose`
     - `Payment Date`
     - `Business Phone`
     - `Owner 1 Name`, `Owner 1 SSN`
     - `Entity Type`

2. **Data Mapping Issues**
   - `mapAirtableToSS4` might not be mapping all fields correctly
   - Some fields might be undefined/null and not handled properly

3. **OpenAI API Failures**
   - If OpenAI API fails, `summarizedBusinessPurpose`, `line16Category`, `line17PrincipalMerchandise` might be empty
   - Check if `OPENAI_API_KEY` is set in Vercel

4. **Lambda Field Mapping**
   - Lambda expects specific field names
   - If field names don't match, fields won't be populated

## Debugging Steps

### 1. Check Vercel Logs
After creating a company, check Vercel logs for:
- `📋 Airtable fields check:` - Shows what fields are in Airtable
- `📋 Mapped SS-4 data:` - Shows what data is being sent to Lambda
- `📋 All ss4Data keys:` - Shows all keys being passed
- `📋 Critical fields:` - Shows critical field values
- `📞 Calling SS-4 Lambda...` - Confirms Lambda is being called

### 2. Check Lambda Logs
```bash
export AWS_PROFILE=llc-admin
aws logs tail /aws/lambda/ss4-lambda-s3-complete --region us-west-1 --since 10m --format short
```

Look for:
- `===> Form data keys:` - Shows what Lambda received
- `===> Company name:` - Shows company name
- `===> Company address:` - Shows address
- `===> Line 4a:` - Shows hardcoded values
- `===> Line 5a:` - Shows parsed address
- `===> Checks found:` - Shows which checkboxes are set

### 3. Verify Airtable Record
1. Go to Airtable Formations table
2. Find the record for the company
3. Verify these fields are populated:
   - Company Name
   - Company Address (should be full: "Street, City, State ZIP")
   - Formation State
   - Business Purpose
   - Payment Date
   - Business Phone
   - Owner 1 Name
   - Owner 1 SSN (or should be "N/A-FOREIGN")
   - Entity Type

### 4. Test Direct API Call
```bash
curl -X POST https://your-vercel-url/api/airtable/generate-ss4 \
  -H "Content-Type: application/json" \
  -d '{"recordId": "recXXXXXXXXXXXXXX", "updateAirtable": true}'
```

## Common Issues and Fixes

### Issue: Line 4a/4b Empty
**Cause**: Hardcoded values not being set
**Fix**: Lambda should always set these, check if `map_data_to_ss4_fields` is being called

### Issue: Line 5a/5b Empty
**Cause**: `Company Address` field in Airtable is empty or malformed
**Fix**: Ensure `Company Address` is saved with full address format: "Street, City, State ZIP"

### Issue: Line 11 Empty (Date)
**Cause**: `Payment Date` field in Airtable is empty
**Fix**: Ensure `Payment Date` is populated when payment completes

### Issue: Line 10/16/17 Empty
**Cause**: OpenAI API call failed or returned empty
**Fix**: 
- Check `OPENAI_API_KEY` is set in Vercel
- Check OpenAI API logs for errors
- Verify `Business Purpose` field has content

### Issue: Checkboxes Not Checked
**Cause**: Entity type detection failed or checkbox logic incorrect
**Fix**: Check `entityType` value and `isLLC` flag

### Issue: Signature Name Missing ",MEMBER"
**Cause**: `signatureName` not being formatted correctly
**Fix**: Check `ownerCount` and `isLLC` values

## Recent Fixes Applied

1. ✅ Updated Lambda URL to correct account
2. ✅ Fixed address parsing for 4-part addresses with country
3. ✅ Added comprehensive logging
4. ✅ Ensured `formationState` is uppercase
5. ✅ Added Airtable field validation logging

## Next Steps

1. Create a new company from questionnaire
2. Check Vercel logs for the field checks
3. Check Lambda logs for what was received
4. Compare with test payload to identify missing fields
5. Fix any missing field mappings

