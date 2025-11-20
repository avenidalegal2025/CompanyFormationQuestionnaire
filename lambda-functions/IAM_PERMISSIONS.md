# Lambda IAM Permissions Setup

## Step 1: Find the Lambda Execution Role

1. Go to **AWS Lambda Console**: https://console.aws.amazon.com/lambda/
2. Click on your Lambda function (e.g., `Fill2848Lambda-arm64`)
3. Go to the **Configuration** tab
4. Click on **Permissions** in the left sidebar
5. Under **Execution role**, you'll see the role name (e.g., `Fill2848Lambda-arm64-role-xxxxx`)
6. Click on the role name to open it in IAM

## Step 2: Check Current Permissions

1. In the IAM role page, click on the **Permissions** tab
2. You'll see attached policies (usually `AWSLambdaBasicExecutionRole` or similar)
3. Check if there's a policy that grants S3 access

## Step 3: Add S3 Permissions

### Option A: Add Inline Policy (Recommended)

1. In the IAM role page, click **Add permissions** → **Create inline policy**
2. Click on the **JSON** tab
3. Paste this policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": [
                "arn:aws:s3:::ss4-template-bucket-043206426879/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl"
            ],
            "Resource": [
                "arn:aws:s3:::avenida-legal-documents/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::ss4-template-bucket-043206426879",
                "arn:aws:s3:::avenida-legal-documents"
            ]
        }
    ]
}
```

4. Click **Next**
5. Name the policy: `S3AccessForPDFGeneration`
6. Click **Create policy**

### Option B: Attach AWS Managed Policy (Less Secure)

1. In the IAM role page, click **Add permissions** → **Attach policies**
2. Search for `AmazonS3ReadOnlyAccess` and attach it (for template bucket)
3. Search for `AmazonS3FullAccess` and attach it (for output bucket - **WARNING: This is very permissive**)

**Note:** Option B gives broader permissions than needed. Option A is more secure.

## Step 4: Verify Permissions

After adding the policy, verify it's attached:

1. Go back to the IAM role page
2. Click on the **Permissions** tab
3. You should see your new inline policy `S3AccessForPDFGeneration`
4. Click on it to verify the JSON is correct

## Step 5: Test the Lambda

1. Go back to your Lambda function
2. Create a test event with this payload:

```json
{
  "form_data": {
    "companyName": "Test Company LLC",
    "principalName": "John Doe",
    "principalAddress": "123 Test St",
    "principalCity": "Miami",
    "principalState": "FL",
    "principalZip": "33101",
    "representativeName": "Avenida Legal",
    "representativeAddress": "12550 Biscayne Blvd Ste 110",
    "representativeCity": "North Miami",
    "representativeState": "FL",
    "representativeZip": "33181",
    "years": "2024, 2025, 2026"
  },
  "s3_bucket": "avenida-legal-documents",
  "s3_key": "test-company-abc123/formation/2848_Test_Company.pdf",
  "templateUrl": "https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f2848.pdf",
  "return_pdf": false
}
```

3. Click **Test**
4. Check the execution logs for any permission errors

## Troubleshooting

### Error: "Access Denied" when reading template

- **Cause**: Lambda role doesn't have `s3:GetObject` permission on template bucket
- **Fix**: Add the policy from Step 3, Option A

### Error: "Access Denied" when writing to S3

- **Cause**: Lambda role doesn't have `s3:PutObject` permission on output bucket
- **Fix**: Add the policy from Step 3, Option A

### Error: "The bucket does not allow ACLs"

- **Cause**: S3 bucket has ACLs disabled (common in newer buckets)
- **Fix**: Remove `s3:PutObjectAcl` from the policy, or enable ACLs on the bucket

### Error: "NoSuchBucket"

- **Cause**: Bucket name is incorrect or in wrong region
- **Fix**: Verify bucket names and ensure Lambda is in the same region

## Policy Breakdown

- **s3:GetObject**: Allows Lambda to download template PDFs from `ss4-template-bucket-043206426879`
- **s3:PutObject**: Allows Lambda to upload filled PDFs to `avenida-legal-documents`
- **s3:PutObjectAcl**: Allows setting ACLs on uploaded objects (may not be needed if bucket ACLs are disabled)
- **s3:ListBucket**: Allows listing bucket contents (helpful for debugging, but not strictly required)

## Security Best Practices

1. ✅ Use inline policies with specific resource ARNs (as shown above)
2. ✅ Only grant permissions to specific buckets, not `*`
3. ✅ Only grant the minimum permissions needed
4. ❌ Avoid using `AmazonS3FullAccess` or `*` resources
5. ❌ Don't grant permissions to buckets you don't need

## Apply to All Three Lambda Functions

Repeat these steps for:
- `Fill2848Lambda-arm64` (Form 2848)
- `FillSS4Lambda-arm64` (SS-4) - when ready
- `Fill8821Lambda-arm64` (Form 8821) - when ready

Or create a shared IAM role that all three Lambda functions can use.

