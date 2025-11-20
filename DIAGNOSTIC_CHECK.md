# Diagnostic Check for Missing Company (Dunete)

## Potential Issues to Check

### 1. Check Vercel Webhook Logs
Look for the Stripe webhook execution logs for the payment session. Check for:
- `Processing company formation payment: cs_...`
- `🔍 Looking up formData for userId: ...`
- `❌ No form data found in DynamoDB for user: ...`
- `✅ FormData retrieved from DynamoDB`
- `📁 Creating document vault for: ...`
- `📊 Syncing formation data to Airtable...`

### 2. Check if formData was saved before checkout
In the checkout session creation logs, look for:
- `💾 Attempting to save formData to DynamoDB for user: ...`
- `✅ Form data saved to DynamoDB for user: ...`
- `❌ Failed to save form data to DynamoDB: ...`

### 3. Check userId mismatch
The webhook looks for formData using:
```typescript
const formDataUserId = session.metadata?.userId || 
                       session.customer_details?.email || 
                       (session.customer_email as string) || '';
```

But formData is saved using:
```typescript
await saveFormData(session.user.email, formData);
```

**Potential issue**: If `session.metadata?.userId` doesn't match `session.user.email`, the webhook won't find the formData.

### 4. Check DynamoDB directly
Run this script with proper AWS credentials:
```bash
npm run check-dynamo-company Dunete
```

Or check DynamoDB console for:
- Table: `Company_Creation_Questionaire_Avenida_Legal`
- Look for items with `formData.company.companyName` containing "Dunete"
- Check the `pk` field (should be the user's email)

### 5. Check Stripe Session Metadata
In Stripe dashboard, find the checkout session and verify:
- `metadata.userId` matches the user's email
- `metadata.type` is `'company_formation'`
- `metadata.companyName` is correct

### 6. Check S3 Bucket
Check if vault was created:
- Bucket: `avenida-legal-documents`
- Look for folders matching pattern: `{company-name-slug}-{hash}/`
- Should contain `formation/` folder with documents

### 7. Check Airtable
- Base: Check the Airtable base for the company name
- Table: `Formations`
- Look for records with `Company Name` containing "Dunete"

## Quick Fix Script

If formData exists but webhook failed, you can manually trigger the sync:

```typescript
// In a script or API endpoint
const userId = 'user@email.com'; // The user's email
const formData = await getFormData(userId);
const session = await stripe.checkout.sessions.retrieve('cs_...'); // The session ID
// Then call handleCompanyFormation(session) manually
```

## Common Issues

1. **formData not saved**: Check if `saveFormData` succeeded in checkout session creation
2. **userId mismatch**: Check if Stripe metadata userId matches the email used to save formData
3. **Webhook not triggered**: Check if Stripe webhook was received and processed
4. **Webhook failed silently**: Check for errors in webhook handler that were caught but not logged
5. **Airtable sync failed**: Check if Airtable API key and base ID are correct

