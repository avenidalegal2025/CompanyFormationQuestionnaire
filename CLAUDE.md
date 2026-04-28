# Avenida Legal — Company Formation Questionnaire

## Section/Sub-Item Numbering Convention (Corp + LLC)

Three-level hierarchy. Every labeled item must use the level-correct format:

| Level | Format | Example | Indent (twips) |
|------:|:-------|:--------|:---------------|
| 1     | `N.M`  | `13.6 Approved Sale.` | left=1440, hanging=1440 (Heading3) |
| 2     | `A.`   | `A. Drag Along – …`  | left=2160, hanging=720 |
| 3     | `i.`   | `i. Voting. …`       | left=2880, hanging=720 |

Rules:
- Letter labels (`A.` `B.` `C.` …) only appear at level 2, immediately under a `N.M` heading.
- Roman labels (`i.` `ii.` `iii.` …) only appear at level 3, under a level-2 letter.
- A single labeled item still uses the level-correct format (e.g. §13.5 has one item — it is `A.`, not `i.`, because it sits one level below the heading).
- Sequences must be contiguous starting from `A.`/`i.` — no `(b)` without an `(a)`, no `ii.` without an `i.`.
- Templates ship many violations (orphan letters, mislabeled levels, missing `(a)` first item). The docgen post-processing in `src/lib/agreement-docgen.ts` enforces this convention. New transforms should follow the same shape (rewrite paren-form labels, then let `normalizeListParagraphs` canonicalize).

## Project Overview
Next.js app for company formation (LLC + C-Corp) in the US. Airtable stores form data, Lambda functions generate legal documents (DOCX), stored on S3, served via client dashboard.

## Architecture
- **Frontend**: Next.js (TypeScript) on Vercel
- **Data**: Airtable (Formations table)
- **Document Generation**: AWS Lambda (Python 3.11) with python-docx
- **Storage**: S3 (`avenida-legal-documents` for output, `company-formation-template-llc-and-inc` for LLC templates)
- **Templates**: DOCX files with `{{placeholder}}` syntax

## Key Files
| File | Purpose |
|------|---------|
| `src/lib/airtable-to-forms.ts` | Maps Airtable fields to document data structures |
| `lambda-functions/shareholder_registry_lambda.py` | C-Corp Shareholder Registry generation |
| `lambda-functions/membership-registry-lambda.py` | LLC Membership Registry generation |
| `src/app/api/airtable/generate-shareholder-registry/route.ts` | API route calling Shareholder Registry Lambda |
| `lambda-functions/bylaws_lambda.py` | C-Corp Bylaws generation (6 templates: bylaws-N-owner(s).docx) |
| `lambda-functions/organizational-resolution-lambda.py` | Org Resolution for both LLC and C-Corp (216 Corp templates) |
| `src/app/api/airtable/generate-bylaws/route.ts` | API route calling Bylaws Lambda |
| `src/app/api/airtable/generate-organizational-resolution/route.ts` | API route calling OrgRes Lambda |
| `scripts/batch-test-lambdas.mjs` | Batch test: invokes all Lambdas with synthetic data, verifies DOCX XML |

## AWS Infrastructure
- **Profile**: `llc-admin`
- **Region**: `us-west-1`
- **Lambda Functions**:
  - `ShareholderRegistryLambda` (handler: `lambda_function.lambda_handler`)
  - `membership-registry-lambda` (handler: `membership-registry-lambda.lambda_handler`)
  - `OrganizationalResolutionS-OrganizationalResolution-LB7obOUKKQ8R` (handler: `lambda_function.lambda_handler`, source: `organizational-resolution-lambda.py`)
  - Bylaws Lambda (handler: `lambda_function.lambda_handler`, source: `bylaws_lambda.py`)
- **Lambda URLs**:
  - ShReg: `https://gfwa6pqqesmrdfnm23snygybyq0gguah.lambda-url.us-west-1.on.aws/`
  - MemReg: `https://rbkwy3w6jltg47gr5q7v543wci0mwxcw.lambda-url.us-west-1.on.aws/`
  - Bylaws: `https://5jzjjp7fgbcsa24vnaxkkngwlm0jnfkz.lambda-url.us-west-1.on.aws/`
  - OrgRes: `https://yo54tsr37rcs3kjqsxt2ecvi2y0zjnli.lambda-url.us-west-1.on.aws/`
  - Form 2848: `https://z246mmg5ojst6boxjy53ilekii0yualo.lambda-url.us-west-1.on.aws/`
  - Form 8821: `https://ql6ufztnwlohsqexpkm7wu44mu0xovla.lambda-url.us-west-1.on.aws/`
  - SS-4: `https://sk5p2uuxrdubzaf2uh7vvqc2bu0kcaoz.lambda-url.us-west-1.on.aws/`

## Lambda Deployment
```bash
# Shareholder Registry (packages as lambda_function.py)
powershell.exe -Command "
  Remove-Item -Recurse -Force 'C:\Users\neotr\AppData\Local\Temp\shreg_deploy' -ErrorAction SilentlyContinue;
  New-Item -ItemType Directory -Path 'C:\Users\neotr\AppData\Local\Temp\shreg_deploy' -Force | Out-Null;
  Copy-Item '<source>.py' 'C:\Users\neotr\AppData\Local\Temp\shreg_deploy\lambda_function.py';
  Remove-Item 'C:\Users\neotr\AppData\Local\Temp\shreg_deploy.zip' -ErrorAction SilentlyContinue;
  Compress-Archive -Path 'C:\Users\neotr\AppData\Local\Temp\shreg_deploy\*' -DestinationPath 'C:\Users\neotr\AppData\Local\Temp\shreg_deploy.zip' -Force;
  aws lambda update-function-code --function-name ShareholderRegistryLambda --zip-file 'fileb://C:\Users\neotr\AppData\Local\Temp\shreg_deploy.zip' --profile llc-admin --region us-west-1
"

# Membership Registry (packages as membership-registry-lambda.py — NOT lambda_function.py)
# Same pattern but: --function-name membership-registry-lambda and filename keeps original name
```

**IMPORTANT**: Use `powershell.exe -Command "..."` for Lambda deployment — `zip` is not available in Git Bash on this machine. Use `Compress-Archive` in PowerShell instead.

## Date Formatting
- **Body text** (Date of Formation, "I hereby certify...as of"): Use `formatMonthDayYear()` → "March 6th, 2026"
- **Table cells** (Date Acquired column): Use `formatDateNumeric()` → "03/06/2026"
- LLC Membership Registry already had `_formation_date_to_mm_dd_yyyy()` in the Lambda for table dates

## DOCX Table Column Widths (python-docx)
Setting `cell.width = Inches(x)` alone does NOT reliably override template column widths. You MUST use direct XML manipulation:
1. Set `w:tblLayout type="fixed"` in `w:tblPr`
2. Set `w:tblW` with total width in twips (1 inch = 1440 twips), `type="dxa"`
3. Replace `w:tblGrid` with new `w:gridCol` elements for each column
4. Set `w:tcW` on EVERY cell in EVERY row with `type="dxa"`

See `_set_table_col_widths()` in both Lambda files for the working implementation.

## Testing / Verification

### Do your own QA/UAT — never ask the user to verify
After any UI/DOCX/Lambda change, **run the verification yourself** before
reporting back: build, invoke prod, screenshot or assert the result, and
summarize what you saw. Do not end a turn with "want me to verify?" — just
verify. The user has said this explicitly more than once. Applies to:
- Vercel deploys (poll the URL, confirm the fix renders)
- Lambda deploys (invoke the function, inspect the output DOCX)
- UI changes (Playwright screenshot the deployed page)
- DOCX output changes (per-page visual QA, see below)

### Visual QA requirement — per-page, not "eyeball"
When verifying a generated DOCX visually (font, numbering, tabs, spacing,
indentation, page breaks, signature blocks, tables), **Read EVERY slice
one by one** and report observations per page. Do not skim, do not
declare "looks good" from a single screenshot. The Word Online
screenshot script (`scripts/word-online-screenshot-fixed.mjs`) produces
readable-NN.png slices at 1600×1800 — each covers ~1.5 pages. Step
through them sequentially (`readable-01.png` through `readable-14.png`
or however many there are), call out anything odd per slice, and only
then claim formatting is verified. "I eyeballed a few slices" is not
sufficient QA.

### Batch test all document variants
```bash
node scripts/batch-test-lambdas.mjs              # run all 20 tests
node scripts/batch-test-lambdas.mjs --save-docx   # also save DOCX files to ~/Downloads/batch-test/
```
Tests 20 variants across OrgRes Corp (8), Shareholder Registry (6), Membership Registry (4), Bylaws (2). Zero dependencies — uses `node:zlib` to extract DOCX XML and run assertions.

### How to preview generated DOCX documents
1. Generate presigned S3 URL: `aws s3 presign "s3://bucket/key" --profile llc-admin --region us-west-1 --expires-in 600`
2. URL-encode it: `node -e "console.log(encodeURIComponent(process.argv[1]))" "$PRESIGNED"`
3. Open in Google Docs viewer: `https://docs.google.com/gview?url=<ENCODED_URL>&embedded=true`
4. This renders the DOCX faithfully in the browser without needing Word installed

### How to re-invoke a Lambda to overwrite existing documents
Invoke the Lambda URL directly with `curl`, passing the same `s3_key` to overwrite:
```bash
curl -s -X POST "<LAMBDA_URL>" -H "Content-Type: application/json" -d '{
  "form_data": { ... },
  "s3_bucket": "avenida-legal-documents",
  "s3_key": "<same-s3-key-as-original>",
  "templateUrl": "<template-url>",
  "return_docx": false
}'
```
This avoids creating a new company — just regenerates and overwrites the file on S3.

### How to inspect DOCX XML (table structure, column widths)
```bash
# Save DOCX locally, then extract and inspect:
powershell.exe -Command "
  Copy-Item '<docx-path>' '<temp>.zip'
  Expand-Archive -Path '<temp>.zip' -DestinationPath '<extract-dir>' -Force
  \$xml = Get-Content '<extract-dir>\word\document.xml' -Raw
  # Check tblGrid:
  [regex]::Matches(\$xml, '<w:tblGrid.*?</w:tblGrid>', 'Singleline') | ForEach { \$_.Value }
  # Check tblW:
  [regex]::Matches(\$xml, '<w:tblW[^/]*/>')  | ForEach { \$_.Value }
  # Check tblLayout:
  [regex]::Matches(\$xml, '<w:tblLayout[^/]*/>')  | ForEach { \$_.Value }
"
```

### Saving Lambda response DOCX locally
```bash
# Invoke with return_docx: true, save JSON response, decode base64 with node:
curl -s -X POST "<LAMBDA_URL>" -H "Content-Type: application/json" \
  -d '{ ... "return_docx": true }' > "$HOME/Downloads/response.json"

node -e "const fs=require('fs'),path=require('path');
const p=path.join(process.env.USERPROFILE,'Downloads','response.json');
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const b=Buffer.from(d.docx_base64,'base64');
fs.writeFileSync(path.join(process.env.USERPROFILE,'Downloads','output.docx'),b);
console.log('Saved '+b.length+' bytes');"
```

## Environment Notes
- **OS**: Windows (Git Bash shell, no WSL `/mnt/c` paths)
- **No `zip` command** — use PowerShell `Compress-Archive` instead
- **No Python installed locally** — use `node` for scripting
- **Node paths**: Use `path.join(process.env.USERPROFILE, ...)` not escaped backslash strings
- **Word COM not available** — can't convert DOCX to PDF locally
- **Vercel auto-deploys** on push to `main` branch
