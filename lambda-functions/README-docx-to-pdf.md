# DOCX to PDF Conversion Lambda

**QA (verified):** Lambda is invoked successfully from the app, but the current shelfio LibreOffice layer throws `NoSuchElementException` during conversion (minimal and real DOCX both fail). Run `npx ts-node --project tsconfig.scripts.json scripts/qa-docx-to-pdf.ts` to reproduce. For production PDF conversion, use **ConvertAPI** (`CONVERTAPI_SECRET` in Vercel) until the Lambda/LO layer is fixed or replaced.

Converts DOCX (base64) to PDF using LibreOffice headless. Used so generated formation documents (Membership Registry, Bylaws, Organizational Resolution, Shareholder Registry) are stored and downloaded as PDFs.

**If downloads are still Word instead of PDF:** The app tries (1) Lambda Invoke, then (2) ConvertAPI if `CONVERTAPI_SECRET` is set. Easiest fix: sign up at [convertapi.com](https://www.convertapi.com/docx-to-pdf), get your secret, and set `CONVERTAPI_SECRET` in Vercel. Then redeploy. No Lambda or IAM needed for PDF conversion.

## Input/Output

- **Input** (POST JSON): `{ "docx_base64": "<base64-encoded-docx>" }`
- **Output**: `{ "pdf_base64": "<base64-encoded-pdf>" }`

## Requirements

- **LibreOffice** in headless mode. Use a Lambda layer, e.g.:
  - [shelfio/libreoffice-lambda-layer](https://github.com/shelfio/libreoffice-lambda-layer) (us-west-1 and other regions)
  - Set env `LIBREOFFICE_BIN` if the binary is at a different path (e.g. after extracting the layer to `/tmp` on cold start).
- **Memory**: 2048 MB or more recommended.
- **Timeout**: 60 seconds or more.

## Deployment (required for PDF downloads)

1. From the repo root, run:
   ```bash
   ./scripts/deploy-docx-to-pdf-lambda.sh
   ```
   (Uses AWS profile `llc-admin` by default; requires an IAM role such as `lambda-ss4-role` and the LibreOffice layer in us-west-2.)

2. Set the Lambda URL in your **Vercel** project (Production + Preview):
   - Project → Settings → Environment Variables
   - Add: `LAMBDA_DOCX_TO_PDF_URL` = `https://a5huhga2dbhieoyzu553mxa2ia0kukax.lambda-url.us-west-2.on.aws/`
   - (Or use the URL printed by the deploy script if you redeploy the Lambda.)

3. Redeploy the Next.js app (or wait for the next deploy) so the new env is used.

After that, document **view** and **download** will convert .docx to PDF on-the-fly, so the Admin and client get PDFs. If `LAMBDA_DOCX_TO_PDF_URL` is not set, the app serves the stored .docx and downloads stay Word.
