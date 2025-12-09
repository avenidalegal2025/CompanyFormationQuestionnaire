# SS-4 Generation Flow Verification

## Complete Data Flow: Questionnaire → SS-4 PDF

### 1. User Fills Questionnaire
- User completes company formation questionnaire
- Data is saved to DynamoDB (formData)
- Payment is processed via Stripe

### 2. Stripe Webhook (`checkout.session.completed`)
**File**: `src/app/api/webhooks/stripe/route.ts`

**Flow**:
1. Receives payment confirmation
2. Creates S3 vault structure
3. Copies template documents
4. Gets formData from DynamoDB
5. Generates initial tax forms (SS-4, 2848, 8821) from formData (fallback)
6. **Syncs to Airtable** - Creates Formation record via `createFormationRecord()`
7. **Calls SS-4 generation API** - After Airtable record is created:
   ```typescript
   POST /api/airtable/generate-ss4
   {
     recordId: airtableRecordId,
     updateAirtable: true
   }
   ```

### 3. SS-4 Generation API
**File**: `src/app/api/airtable/generate-ss4/route.ts`

**Flow**:
1. Fetches Airtable record by `recordId`
2. Maps Airtable fields to SS-4 format via `mapAirtableToSS4()`
3. Calls OpenAI API for:
   - Line 10: Summarized Business Purpose (max 45 chars)
   - Line 16: Business category classification
   - Line 17: Principal merchandise/services (max 168 chars)
4. Calls Lambda function with mapped data:
   ```typescript
   POST https://sk5p2uuxrdubzaf2uh7vvqc2bu0kcaoz.lambda-url.us-west-1.on.aws/
   {
     form_data: {
       companyName, companyAddress, responsiblePartyName, etc.
       summarizedBusinessPurpose, line16Category, line17PrincipalMerchandise,
       applicantPhone, signatureName, paymentDate, etc.
     },
     s3_bucket: "avenida-legal-documents",
     s3_key: "vault-path/formation/SS-4_CompanyName.pdf",
     templateUrl: "https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/fss4.pdf"
   }
   ```
5. Updates Airtable with SS-4 URL
6. Returns SS-4 PDF buffer

### 4. Lambda Function
**File**: `lambda-functions/ss4_lambda_s3_complete.py`
**Account**: `043206426879` (llc-admin - Avenida Legal LLC)
**Region**: `us-west-1`
**Function URL**: `https://sk5p2uuxrdubzaf2uh7vvqc2bu0kcaoz.lambda-url.us-west-1.on.aws/`

**Flow**:
1. Receives form_data from API
2. Maps data to SS-4 fields via `map_data_to_ss4_fields()`
3. Translates Spanish text to English (company name, business purpose, etc.)
4. Parses company address for Line 5a (street) and Line 5b (city, state, zip)
5. Creates PDF overlay with all fields and checkboxes
6. Merges overlay with SS-4 template
7. Uploads filled PDF to S3
8. Returns PDF buffer

## Field Mappings Verified

### Text Fields
- ✅ Line 1: Company Name (full name with suffix)
- ✅ Line 2: Trade Name (usually empty)
- ✅ Line 3: Mailing Address Line 1
- ✅ Line 4a: "12550 BISCAYNE BLVD STE 110" (hardcoded)
- ✅ Line 4b: "MIAMI FL, 33181" (hardcoded)
- ✅ Line 5a: Street address (parsed from Company Address)
- ✅ Line 5b: City, State, ZIP (parsed from Company Address)
- ✅ Line 6: City, State
- ✅ Line 7a: Responsible Party Name
- ✅ Line 7b: Responsible Party SSN (or "N/A-FOREIGN")
- ✅ Line 8b: LLC Member Count (if LLC)
- ✅ Line 9b: Formation State (ALL CAPS)
- ✅ Line 10: Summarized Business Purpose (max 45 chars, from OpenAI)
- ✅ Line 11: Payment Date in (MM, DD, YYYY) format
- ✅ Line 12: "DECEMBER" (hardcoded) at (495, 337)
- ✅ Line 15: "N/A" (hardcoded)
- ✅ Line 17: Principal Merchandise (max 168 chars, from OpenAI)
- ✅ Designee Name: "ANTONIO REGOJO" (with officer title for C-Corp)
- ✅ Designee Address: "10634 NE 11 AVE, MIAMI, FL, 33138" (hardcoded)
- ✅ Designee Phone: "(786) 512-0434" (hardcoded)
- ✅ Designee Fax: "866-496-4957" (hardcoded)
- ✅ Applicant Phone: Business Phone from Airtable
- ✅ Signature Name: Responsible Party Name + ",SOLE MEMBER" or ",MEMBER"

### Checkboxes
- ✅ Line 8a: "Yes" for LLC, "No" for C-Corp
- ✅ Line 8c: "Yes" if LLC with valid SSN
- ✅ Line 9a: Entity type checkbox (LLC, Corporation, Partnership, etc.)
- ✅ Line 10: "Started new business" (always checked)
- ✅ Line 14: "Will not have employees" (always checked)
- ✅ Line 16: Business category checkbox (from OpenAI classification)
- ✅ Line 18: "No" (always checked)

## Environment Variables Required

### Vercel Environment Variables
- `LAMBDA_SS4_URL`: `https://sk5p2uuxrdubzaf2uh7vvqc2bu0kcaoz.lambda-url.us-west-1.on.aws/`
- `OPENAI_API_KEY`: For summarizing business purpose
- `AIRTABLE_API_KEY`: For fetching Formation records
- `AIRTABLE_BASE_ID`: Airtable base ID
- `AIRTABLE_TABLE_NAME`: "Formations"
- `S3_DOCUMENTS_BUCKET`: "avenida-legal-documents"

## Testing Checklist

✅ Lambda function deployed to correct account (llc-admin: 043206426879)
✅ Lambda Function URL configured and accessible
✅ All field coordinates verified and tested
✅ Address parsing working correctly
✅ Translation from Spanish to English working
✅ OpenAI integration for Lines 10, 16, 17 working
✅ All checkboxes drawing correctly
✅ Signature name formatting (",SOLE MEMBER" / ",MEMBER") working
✅ Designee name with officer title for C-Corp working
✅ Payment date formatting working
✅ Line 12 (DECEMBER) positioned correctly at (495, 337)

## Next Steps

1. **Update Vercel Environment Variable**:
   - Set `LAMBDA_SS4_URL` to: `https://sk5p2uuxrdubzaf2uh7vvqc2bu0kcaoz.lambda-url.us-west-1.on.aws/`

2. **Test End-to-End**:
   - Fill out a new company questionnaire
   - Complete payment
   - Verify SS-4 is generated automatically
   - Check all fields are filled correctly in the PDF

3. **Monitor**:
   - Check CloudWatch logs for any errors
   - Verify Airtable record is updated with SS-4 URL
   - Confirm PDF is accessible in S3 vault

