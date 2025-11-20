# Debug Guide: Tax Form PDF Generation

## Session ID
`cs_test_b1MOpFLKRO2tpvzBprcZzj783kLoZ6fd4IEfclEO8vp0UXGW3fsQoJ9els`

## Steps to Debug

### 1. Check Vercel Webhook Logs

Go to Vercel Dashboard → Your Project → Logs → Filter for this session ID

Look for these log entries in order:

#### A. Form Data Retrieval
```
🔍 Looking up formData for userId: <email>
✅ FormData retrieved from DynamoDB
```
OR
```
❌ No form data found in DynamoDB for user: <email>
🔄 Attempting to load form data snapshot from S3 using session ID: cs_test_...
✅ Loaded form data snapshot from S3
```

**If you see "❌ No form data found" and "❌ No form data snapshot found":**
- Form data was not saved during checkout
- Check checkout session creation logs for errors

#### B. PDF Generation Start
```
📄 Generating tax forms (SS-4, 2848, 8821)...
📋 FormData for PDF generation: { ... }
```

#### C. Lambda Function Calls
For each PDF, you should see:
```
📞 Calling Lambda: <lambda-url>
📄 Template: <template-url>
📋 Data keys: <list of keys>
📡 Lambda response status: 200 OK
✅ Lambda returned valid PDF (<size> bytes)
```

**If Lambda fails, you'll see:**
```
❌ Lambda call failed: <error message>
❌ Lambda URL: <url>
```

#### D. S3 Upload
```
📤 Uploading document: SS-4_<Company>.pdf to formation/
✓ Uploaded: <vault-path>/formation/SS-4_<Company>.pdf (<size> bytes)
```

#### E. Document Array
```
✅ SS-4 PDF added to documents: <s3-key>
✅ Form 2848 PDF added to documents: <s3-key>
✅ Form 8821 PDF added to documents: <s3-key>
```

#### F. Airtable Sync
```
📋 Document URLs for Airtable: {
  ss4: '<s3-key>' or 'NOT FOUND',
  form2848: '<s3-key>' or 'NOT FOUND',
  form8821: '<s3-key>' or 'NOT FOUND'
}
📊 Airtable record tax form URLs: {
  'SS-4 URL': '<url>' or 'EMPTY',
  '2848 URL': '<url>' or 'EMPTY',
  '8821 URL': '<url>' or 'EMPTY'
}
```

### 2. Common Issues and Solutions

#### Issue: "❌ No form data found"
**Solution:** Check if `saveFormData` succeeded in checkout session creation logs

#### Issue: "❌ Lambda call failed"
**Possible causes:**
- Lambda function is down or returning errors
- Template URL is incorrect
- Lambda expects different JSON format
- Network timeout

**Check:**
- Lambda function logs in AWS
- Test Lambda URLs directly with curl

#### Issue: "Lambda returned empty PDF"
**Possible causes:**
- Lambda returned error instead of PDF
- Response content-type is wrong
- Response is not binary

#### Issue: "Response doesn't appear to be a PDF"
**Possible causes:**
- Lambda returned HTML error page
- Lambda returned JSON error
- Response is corrupted

#### Issue: "Document URLs for Airtable: ss4: 'NOT FOUND'"
**Possible causes:**
- PDFs were not added to documents array
- Document IDs don't match
- PDFs failed to generate

### 3. Check S3 Bucket

Check if files exist in S3:
- Bucket: `avenida-legal-documents`
- Look for: `form-data/cs_test_b1MOpFLKRO2tpvzBprcZzj783kLoZ6fd4IEfclEO8vp0UXGW3fsQoJ9els.json`
- Look for vault folder: `<company-name-slug>-<hash>/formation/SS-4_*.pdf`
- Look for vault folder: `<company-name-slug>-<hash>/formation/2848_*.pdf`
- Look for vault folder: `<company-name-slug>-<hash>/formation/8821_*.pdf`

### 4. Check Airtable

- Base: Your Airtable base
- Table: `Formations`
- Find record with Stripe Payment ID: `cs_test_b1MOpFLKRO2tpvzBprcZzj783kLoZ6fd4IEfclEO8vp0UXGW3fsQoJ9els`
- Check columns:
  - `SS-4 URL`
  - `2848 URL`
  - `8821 URL`

### 5. Manual Test Lambda Functions

Test each Lambda directly:

```bash
# SS-4
curl -X POST https://rgkqsugoslrjh4kqq2kzwqfnry0ndryd.lambda-url.us-west-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "templateUrl": "https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/fss4.pdf",
    "data": {
      "companyName": "Test Company",
      "entityType": "LLC",
      "formationState": "Wyoming"
    }
  }' \
  --output test-ss4.pdf

# 2848
curl -X POST https://z246mmg5ojst6boxjy53ilekii0yualo.lambda-url.us-west-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "templateUrl": "https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f2848.pdf",
    "data": {
      "companyName": "Test Company"
    }
  }' \
  --output test-2848.pdf

# 8821
curl -X POST https://ql6ufztnwlohsqexpkm7wu44mu0xovla.lambda-url.us-west-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "templateUrl": "https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f8821.pdf",
    "data": {
      "companyName": "Test Company"
    }
  }' \
  --output test-8821.pdf
```

## Next Steps

1. **Check Vercel logs** for the session ID above
2. **Share the relevant log sections** showing where it fails
3. **Check S3** to see if any files were created
4. **Check Airtable** to see if URLs were saved

The enhanced logging should show exactly where the process is failing.

