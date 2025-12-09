# Manual SS-4 Generation

If the SS-4 wasn't automatically generated after payment, you can manually trigger it:

## Option 1: Use the API Endpoint Directly

1. **Get the Airtable Record ID**:
   - Go to Airtable → Formations table
   - Find the company record
   - Copy the Record ID (starts with `rec`)

2. **Call the API endpoint**:
   ```bash
   curl -X POST https://your-vercel-url/api/airtable/generate-ss4 \
     -H "Content-Type: application/json" \
     -d '{"recordId": "recXXXXXXXXXXXXXX", "updateAirtable": true}'
   ```

   Or use the Vercel dashboard → Functions → `/api/airtable/generate-ss4` → Test

## Option 2: Use the Batch Endpoint

If you have multiple records without SS-4:

```bash
curl -X POST https://your-vercel-url/api/airtable/generate-ss4-batch \
  -H "Content-Type: application/json" \
  -d '{"missingOnly": true, "maxRecords": 10}'
```

This will generate SS-4 for all records that don't have an SS-4 URL.

## Option 3: Check Vercel Logs

1. Go to Vercel Dashboard → Your Project → Logs
2. Filter for recent webhook calls
3. Look for:
   - `📄 Generating SS-4 from Airtable record...`
   - `📡 SS-4 generation API response status:`
   - `❌ Failed to generate SS-4 from Airtable:`

## Common Issues

1. **API endpoint not being called**: Check if `baseUrl` is correct in webhook
2. **Airtable fields missing**: Check the `📋 Airtable fields check:` log
3. **Lambda failing**: Check Lambda logs for errors
4. **OpenAI API failing**: Check if `OPENAI_API_KEY` is set

