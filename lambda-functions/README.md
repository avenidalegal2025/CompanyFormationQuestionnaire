# Lambda Functions for PDF Generation (S3 Integration)

These Lambda functions generate filled PDF forms (SS-4, 2848, 8821) and upload them directly to S3 company folders.

## Overview

The Lambda functions:
1. Download template PDFs from S3
2. Fill PDFs with form data
3. Upload filled PDFs to company S3 folders
4. Optionally return PDF as binary for backup

## Lambda Function Files

- **2848_lambda_s3.py** - Form 2848 (Power of Attorney) - ✅ Complete with field mappings
- **ss4_lambda_s3.py** - SS-4 (EIN Application) - ⚠️ Needs field mappings
- **8821_lambda_s3.py** - Form 8821 (Tax Information Authorization) - ⚠️ Needs field mappings

## Input Format

The Lambda functions expect a JSON payload:

```json
{
  "form_data": {
    // Form-specific data fields
  },
  "s3_bucket": "avenida-legal-documents",
  "s3_key": "miami-llc-dgvzdcs0/formation/SS-4_Company.pdf",
  "templateUrl": "https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/fss4.pdf",
  "return_pdf": true
}
```

### Parameters

- **form_data** (required): Object containing form field values
- **s3_bucket** (required): Destination S3 bucket name
- **s3_key** (required): Destination S3 key (path) for the filled PDF
- **templateUrl** (required): S3 URL of the template PDF
- **return_pdf** (optional): If `true`, returns PDF as binary in response body

## Response Format

### JSON Response (when return_pdf is false or not set)

```json
{
  "statusCode": 200,
  "body": {
    "message": "✅ PDF uploaded to S3",
    "s3_bucket": "avenida-legal-documents",
    "s3_key": "miami-llc-dgvzdcs0/formation/SS-4_Company.pdf",
    "s3_url": "s3://avenida-legal-documents/miami-llc-dgvzdcs0/formation/SS-4_Company.pdf"
  }
}
```

### Binary Response (when return_pdf is true)

- **Content-Type**: `application/pdf`
- **Body**: PDF file as binary data
- **Headers**: Include `Content-Disposition` with filename

## Deployment

### Prerequisites

1. AWS Lambda function with Python 3.9+ runtime
2. Required Python packages:
   - `reportlab` - For PDF overlay generation
   - `PyPDF2` - For PDF merging
   - `boto3` - For S3 operations (included in Lambda runtime)

### Environment Variables

Set these in your Lambda function configuration:

- `BUCKET_NAME`: Default template bucket (fallback if templateUrl parsing fails)
- `OUTPUT_BUCKET`: Default output bucket (usually 'avenida-legal-documents')

### IAM Permissions

The Lambda execution role needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::ss4-template-bucket-043206426879/*",
        "arn:aws:s3:::avenida-legal-documents/*"
      ]
    }
  ]
}
```

### Deployment Steps

1. **Package dependencies** (if using custom packages):
   ```bash
   pip install reportlab PyPDF2 -t .
   zip -r lambda-function.zip .
   ```

2. **Upload to Lambda**:
   - Go to AWS Lambda Console
   - Select your function (SS-4, 2848, or 8821)
   - Upload the `.zip` file or paste code directly
   - Set handler to `lambda_function.lambda_handler` (or appropriate filename)

3. **Update Lambda Function URL** (if using):
   - Ensure CORS is enabled if calling from web
   - Note the Function URL for use in environment variables

## Completing SS-4 and 8821 Field Mappings

The SS-4 and 8821 Lambda functions need field position mappings added. Follow the pattern from `2848_lambda_s3.py`:

1. **Define FIELD_POSITIONS** dictionary with PDF coordinates:
   ```python
   FIELD_POSITIONS = {
       "Field Name": (x, y),
       # ... more fields
   }
   ```

2. **Implement create_overlay()** function:
   - Map `form_data` fields to PDF coordinates
   - Use `c.drawString(x, y, value)` to place text
   - Handle multi-line fields (addresses, etc.)

3. **Test with sample data**:
   - Use the form data structure sent from the TypeScript code
   - Verify field positions match the actual PDF form

## Testing

### Test with curl

```bash
curl -X POST https://your-lambda-url.lambda-url.us-west-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "form_data": {
      "companyName": "Test Company LLC",
      "responsiblePartyName": "John Doe",
      "responsiblePartySSN": "123-45-6789"
    },
    "s3_bucket": "avenida-legal-documents",
    "s3_key": "test-company-abc123/formation/SS-4_Test_Company.pdf",
    "templateUrl": "https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/fss4.pdf",
    "return_pdf": true
  }' \
  --output test-output.pdf
```

### Verify S3 Upload

Check that the PDF was uploaded to the correct S3 location:
```bash
aws s3 ls s3://avenida-legal-documents/test-company-abc123/formation/
```

## Troubleshooting

### Error: "Missing 'form_data' or 'drive_folder_url'"
- **Cause**: Old Lambda code still expecting `drive_folder_url`
- **Fix**: Deploy updated Lambda function with S3 support

### Error: "Missing 's3_bucket' or 's3_key'"
- **Cause**: Payload missing required S3 parameters
- **Fix**: Ensure TypeScript code sends `s3_bucket` and `s3_key`

### Error: "Invalid input payload"
- **Cause**: Malformed JSON or missing required fields
- **Fix**: Check Lambda logs for specific error details

### PDF not appearing in S3
- **Cause**: IAM permissions or S3 key path issue
- **Fix**: 
  - Verify Lambda execution role has S3 permissions
  - Check S3 key path is correct (no leading/trailing slashes)
  - Review CloudWatch logs for upload errors

## Integration with Next.js

The TypeScript code in `src/lib/pdf-filler.ts` automatically:
- Constructs S3 bucket and key from `vaultPath` and filename
- Sends `form_data`, `s3_bucket`, `s3_key`, and `templateUrl` to Lambda
- Handles both JSON and binary responses
- Uploads PDF to S3 as backup even if Lambda uploads it

## Next Steps

1. ✅ Deploy `2848_lambda_s3.py` (complete)
2. ⚠️ Complete field mappings for `ss4_lambda_s3.py`
3. ⚠️ Complete field mappings for `8821_lambda_s3.py`
4. ✅ Update Lambda Function URLs in environment variables
5. ✅ Test with real form data

