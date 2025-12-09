# Data Flow Issue Analysis

## Problem
Fields are empty in SS-4 PDF when generated from questionnaire, but test works fine.

## Data Flow Path

1. **Questionnaire** → Saves to DynamoDB
2. **Payment** → Stripe webhook triggers
3. **Webhook** → Creates Airtable record
4. **Webhook** → Calls `/api/airtable/generate-ss4` with `recordId`
5. **API** → Fetches Airtable record
6. **API** → Calls `mapAirtableToSS4(record)` → Returns `ss4Data`
7. **API** → Adds OpenAI fields: `summarizedBusinessPurpose`, `line16Category`, `line17PrincipalMerchandise`
8. **API** → Calls Lambda with `ss4Data` as `form_data`
9. **Lambda** → Maps `form_data` to SS-4 fields

## Potential Issues

### Issue 1: API Call Failing
- Webhook calls API endpoint
- If API fails, falls back to initial SS-4 generation (uses old `transformDataForSS4`)
- **Fix**: Added better logging to see if API call succeeds

### Issue 2: Airtable Fields Missing
- Airtable record might not have all fields populated
- **Fix**: Added logging to show which Airtable fields are present

### Issue 3: Data Mapping Mismatch
- `mapAirtableToSS4` might not be returning all required fields
- **Fix**: Added logging to show all `ss4Data` keys

### Issue 4: OpenAI API Failing
- If OpenAI fails, `summarizedBusinessPurpose`, `line16Category`, `line17PrincipalMerchandise` are empty
- **Fix**: Check OpenAI API key and error handling

## Debugging Steps

1. **Check Vercel Logs** for:
   - `📋 Airtable fields check:` - Shows what's in Airtable
   - `📋 Mapped SS-4 data:` - Shows what's being sent
   - `📋 All ss4Data keys:` - Shows all field names
   - `📞 Calling SS-4 Lambda...` - Confirms Lambda is called
   - `📡 SS-4 generation API response status:` - Shows if API call succeeded

2. **Check Lambda Logs** for:
   - `===> Form data keys:` - Shows what Lambda received
   - `===> Company name:` - Shows company name
   - `===> Company address:` - Shows address
   - `===> Line 4a:` - Shows hardcoded values
   - `===> Line 5a:` - Shows parsed address

3. **Compare Test vs Real**:
   - Test payload has all fields
   - Real payload might be missing fields
   - Check if Airtable record has all required fields

## Next Steps

1. Create a new company
2. Check Vercel logs for the field checks
3. Check if API call succeeded (status 200)
4. Check Lambda logs for what was received
5. Compare with test to identify missing fields

