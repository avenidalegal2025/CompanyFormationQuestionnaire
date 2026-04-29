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

## Orphan-title / page-break rule

A title (Article heading, §N.M section heading, or any visually-titled paragraph) **must never** be the last line on a page with its body content on the next page. The user's rule, verbatim: *"no titles with a page break right under, at least one line before the break"*.

Mechanism — every title paragraph carries `<w:keepNext/>` (val=1 implicit), which tells Word to keep this paragraph on the same page as the next one:
- `addKeepNextToHeadings` flips the template's `<w:keepNext w:val="0"/>` (Google Docs export default) to `<w:keepNext/>` on every Heading2/Heading3-styled paragraph and every `ARTICLE N:` caption.
- `forceKeepNextBeforeTables` adds `<w:keepNext/>` to the paragraph immediately before any `<w:tbl>` so heading → intro → empty separator → table all chain together.
- For the §4.2 Initial Capital Contributions table specifically, `pageBreakBefore=1` is set on the §4.2 *heading paragraph* (NOT on the empty paragraph between heading and table — that's what previously orphaned the heading). The table block always starts on a fresh page.

Audit — `/tmp/audit_hierarchy.py` checks every title-style paragraph and pre-table paragraph for `keepNext=1`. CI/regen should fail if any title lacks it.

**Refinement (2026-04-29):** keepNext on a §X.Y heading is only added when the heading is **title-only** (body lives on the next paragraph). For inline-titled headings (title + body in the same paragraph), keepNext is unnecessary (no orphan-title risk between heading and body) and forces the entire paragraph block to chain to the next, leaving big half-blank pages above when the block doesn't fit. `keepLines=0` is set on every §X.Y heading so long inline-titled paragraphs (e.g. §13.6 Purchase upon Deadlock at 17 lines) can break across pages cleanly.

## Generic post-processing passes in `src/lib/agreement-docgen.ts`

The docgen pipeline runs ~30 transforms on the rendered template XML. Strategy: pattern-class generic passes whenever possible, targeted rules only when content-aware legal judgment is required.

**Generic shape/layout passes:**
- `mergeTitleOnlyHeadingsWithBody` — title-only §X.Y inline-merges with following body paragraph when body isn't a labeled list intro.
- `rebuildFracturedNumberedHeadings` — when a heading's runs are split into many tiny pieces (whitespace + N.M + tab + UNDERLINED title + period + tab + body, e.g. §15.11), rebuild as canonical Shape B.
- `standardizeNumberedHeadingShape` — every numbered §X.Y has consistent number run + underlined title run + body run.
- `collapseEmptiesBetweenListItems` — drop blank paragraphs between consecutive A./B. or i./ii. items at same indent.
- `removeKeepLinesFromListItems` — strip keepLines from letter/roman list items so long items break across pages instead of leaving half-blank pages above.
- `relabelOrdinalWordListItems` — "First, Second, Third, Fourth" at letter-list indent → A./B./C./D.
- `normalizeAllSectionHeadingPPr` — canonical Heading3 pPr on every §X.Y; keepNext only when title-only; keepLines=0 always.
- `alignHeadingWrapWithBody` — dynamic hanging indent computed from "N.M Title. " prefix length so the wrap line aligns vertically with the first body word. Inserts `<w:tab/>` after period; uses jc=left so first-line justification doesn't push body word past wrap column.
- `stripBoldFromInlineTitleRuns` — bold-underlined → underlined-only on §X.Y title runs.
- `chainKeepNextThroughEmpties` — propagates keepNext through empty separators ONLY for ARTICLE captions and title-only §X.Y headings. Inline-titled exempt.

**Conditional / covenant-driven passes:**
- `closeArticleXIIIGap` — when ARTICLE XIII is stripped (no covenants), self-detects and renumbers XIV→XIII, XV→XIV, §14.x→§13.x, §15.x→§14.x.
- `relabel91LettersAfterRoFRStrip` — when §9.1.A is removed (RoFR off), shifts B→A, C→B, D→C, E→D among remaining §9.1 letter items. Runs AFTER `normalizeListParagraphs`.
- `applyCorpVotingReplacements` — voting-text sweep: when `major_decisions_voting != 'majority'`, replaces every "Majority" → "Super Majority"/"Unanimous". Three protections: §1.6 Majority definition, "Majority Shareholders" idiom (controlling owners, not vote), already-replaced "Super Majority".
- `applyCorpBankAccountText` — only applies "two of the Officers" wording if officer count ≥ 2; forces "one" otherwise.

**Sig-block / table passes:**
- `renderOfficersList` — §10.6 → centered borderless 2-col table, both columns left-aligned (so first letter of every name aligns vertically).
- `expandSignatureBlockSpacing` — 2 extra empty paragraphs between consecutive signer blocks.
- `normalizeSignatureBlockLayout` — every sig paragraph gets canonical `<w:ind w:left="5040"/>` + `<w:jc w:val="both"/>` (inserts jc when missing for owners 4+ inserted by addExtraCorpShareholders).
- `fixCapitalTableWidth` — §4.2 column widths 2200/1700/2300/2800 (totals 9000); forces jc=center + zero ind on every cell paragraph.
- `addExtraCorpShareholders` — owners 4-6 cloned from rendered shareholder_3 row to inherit `<w:tcBorders>`/`<w:trPr>`/`<w:tcPr>`.

**Generic cross-reference remediation (shipped 2026-04-29):**
- `repairDanglingCrossReferences` — scans body text for "Section N.M" / "paragraph N.M" cross-refs. If target doesn't exist, applies one of two generic strips:
  - **Sentence-end strip**: ref ends a sentence ("per Section 13 below.") → drop the entire sentence
  - **Prefix strip**: ref starts a sentence ("Subject to Section 13 below, persons may…") → strip prefix up to the comma
- Self-healing: catches future template changes / covenant combos that produce dangling refs without per-section rules.
- **Specific repoint rules still required for SEMANTIC mismatches** (target exists but wrong topic — e.g. §4.4 13.2→13.6, §9.2.A.iii 9.1(iv)→9.1D — those need legal interpretation).

**Date / name rendering:**
- `effective_date` (Corp) and `Date_of_formation_LLC` use `new Date()` at generation time — agreement effective date = today, NOT corp's formation date.
- Entity name auto-suffix: appends `, Inc.` (Corp) / `, LLC` (LLC) when `entity_name` lacks any standard suffix. Production form already supplies suffix from dropdown; fallback only fires for test fixtures or direct API calls.

## Audit + visual review pipeline

| Tool | What | Runtime |
|------|------|---------|
| `scripts/audit-corp-structure.mjs` | 4-layer structural XML auditor (hierarchy, run shape, completeness, layout) + cross-reference validator | per-DOCX, ~50ms |
| `scripts/audit-corp-variants.ts` | Runs the 144-variant matrix (6 owners × 3 voting × 8 covenant) through the auditor; `--save` writes DOCXes to `/mnt/c/Users/neotr/Downloads/corp-variants/` | ~25s for full matrix |
| `scripts/regen-sample-pdfs.ts` | Regenerates 5 representative samples + LibreOffice PDF + pdftoppm PNG renders | ~60s |
| `scripts/visual-review-corp-variants.mjs` | DOCX → PDF (LibreOffice) → PNG (180 DPI) → Claude Haiku 4.5 vision per page; aggregates issues. Anthropic key from AWS Secrets Manager `claude-maestro/api-keys` us-east-1. | ~30 min, ~$5 |

**Cross-reference audit rule (Layer 1):** every `Section N.M` / `Paragraph N.M` / `Article ROMAN` / `9.1D` reference is verified against the set of existing section/article numbers in the doc. Broken refs fail the build with paragraph context.

**Latest Haiku review (2026-04-29):** 136/144 clean; the 8 with flags are 20 noise (underline-under-digits Haiku misread) + 2 false positives. Effectively 100% clean.

**Haiku reliability caveats:** Haiku reliably catches structural issues (orphan headings, missing labels, sig-block misalignment, combined paragraphs) but UNRELIABLY reports underline pixel boundaries on inline-titled headings — it consistently flags "underline extends under section number digits" when the XML structure is verifiably correct. Treat underline-position findings as noise unless XML inspection confirms.

## WSL-specific gotchas (when running tooling from `/mnt/c/...`)
- `git` commands MUST run with cwd inside the project — never chain `cd` with git via `;` (filesystem-boundary error). Use `cd <path> && git ...`.
- `USERPROFILE` is undefined; `audit-corp-variants.ts` SAVE_DIR resolves to `/mnt/c/Users/neotr/Downloads/corp-variants` directly when running under WSL `/home/`.
- `tsx` script imports use `.js` extension on relative imports (`../src/lib/agreement-docgen.js`).
- AWS calls: set `AWS_CONFIG_FILE=/mnt/c/Users/neotr/.aws/config` + `AWS_SHARED_CREDENTIALS_FILE=/mnt/c/Users/neotr/.aws/credentials`.
- Playwright pipelines must run from Windows side via `cmd.exe /c`, not WSL (Chromium needs system libs).

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
