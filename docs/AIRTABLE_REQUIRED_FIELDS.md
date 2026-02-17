# Airtable Formations – Required fields for document URLs

## Why the success page can hang (and what we fixed)

The success page polls `GET /api/documents` and considers "ready" when it sees key documents (e.g. SS-4, org resolution) with `s3Key` or `status: generated`. It was hanging when:

1. **Email case mismatch** – Webhook saved under Stripe’s email (e.g. `Alice@Email.com`) and the API read with NextAuth’s email (`alice@email.com`). DynamoDB keys are case-sensitive, so the API saw no documents. **Fix:** Normalize to lowercase when saving and when reading (webhook + `getUserCompanyDocuments` / `saveUserCompanyDocuments`).
2. **Strict "ready" when entityType was unknown** – If `entityType` wasn’t in localStorage (e.g. new device or cleared storage), we required at least `ss4-ein-application` with `s3Key`. If the API returned documents under different ids first, we never became "ready". **Fix:** When `entityType === null`, treat as ready if there is *any* document with `s3Key` or `status: generated`.
3. **401** – If the user wasn’t logged in, the API returned 401 and we showed "Inicia sesión". That’s correct; the escape hatch still lets them go to the hub.

If the list is still empty in production, check Vercel logs for `[documents] Empty list for userId` to confirm which email is being used and that the webhook ran for that user.

If Vercel logs show **"Failed to update Airtable (continuing anyway): UNKNOWN_FIELD_NAME"**, the Formations table is missing one or more of the document URL fields the app writes to.

## Who creates the fields: AWS Lambda

**AWS creates these fields** via the **Ensure Airtable Fields** Lambda. Deploy and run it so the Formations table gets all required URL columns:

```bash
cd airtable-fields-cdk
export AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
export AIRTABLE_API_KEY=patXXXXXXXXXXXX
./deploy.sh
```

See `airtable-fields-cdk/README.md` for details.

## Document URL fields (exact names)

The Lambda ensures these exist on the **Formations** table (type: **URL**). If you add them manually, use these names exactly:

| Field name (exact) |
|--------------------|
| Membership Registry URL |
| Organizational Resolution URL |
| Operating Agreement URL |
| Shareholder Registry URL |
| Bylaws URL |
| SS-4 URL |
| 2848 URL |
| 8821 URL |

Spelling and spaces must match exactly. The app updates these when generating or linking documents after payment.

## Other log messages

- **"No officer role found for (C-Corp) - using PRESIDENT as fallback"** – For C-Corp, the SS-4 flow expects at least one officer with a role (e.g. Officer 1 Role). If missing, it uses PRESIDENT. Ensure **Officer 1 Role**, **Officer 2 Role**, etc. are filled in the questionnaire (or in Airtable) for C-Corp.
- **"SS-4 will be generated from Airtable in Step 8"** – Informational: SS-4 will be generated later in the process; not necessarily an error.
