# Avenida Legal — Session Handoff (2026-04-20)

**Repo:** `C:\Users\neotr\Documents\AvenidaLegal\CompanyFormationQuestionnaire`
**Live app:** https://company-formation-questionnaire.vercel.app
**Latest commit:** `60807b5f` on `main` (pushed, deployed)

---

## What shipped this session — 17 v2 client-video TODOs + 2 dead Lambdas + pending plan

### Batch 1 — v2 pass-1 TODOs (previously the "8 TODOs" list)
| # | Fix | Commit |
|---|---|---|
| 2 | non-compete duration default 2y | `ef5db103` |
| 3 | non-compete scope default state | `ef5db103` |
| 4 | non-compete tooltips | `ef5db103` |
| 5 | ROFR default 180 → 60d | `ef5db103` |
| 6 | SS-4 dashboard polling | `178006a2` (+ Lambda restore below) |
| 8 | duplicate 1.8 numbering (Super Majority renumbers Officers) | `dde16cc3` |
| 9 | Article II 2.1/2.2/2.3/2.4 numbering | `dde16cc3` |
| 14 | officer inline list + director trailing comma | `dde16cc3` |
| 15 | county placeholder (4 fixes: lookup helper, Avenida fallback, title-case, superscript-th) | `a45429a5`, `0affcdda`, `50126820`, `9d09b6d3` |

### Batch 2 — v2 pass-2 additions
| # | Fix | Commit |
|---|---|---|
| 1 | President warning reactive (flips to ✓ when role assigned) | `75e0b4e2` |
| 7 | strip all non-TNR fonts across styles/theme/document.xml | `75e0b4e2` |
| 10 | § 4.2 capital table width 10570 → 9000 twips + proportional grid + tcW on every cell | `75e0b4e2` |
| 11/12 | § 9.2 romanette list: wide 8640 tabs → 1800 stop + hanging 720/360 indent | `75e0b4e2` |
| 13 | $25,000 → $225,000 currency bug (removed dead xmlTextReplace fallback) | `75e0b4e2` |
| 16 | signature "Owner" label → owner.title (or removed if blank) | `75e0b4e2` |
| 17 | [SIGNATURE PAGE BELOW] dangling heading removed | `75e0b4e2` |

### Feature — pending plan (`compiled-plotting-yeti.md`)
- **Specific Responsibilities section** wired into agreement docgen — reads Step 6 fields, renders `(a) <name>, as <title>: <desc>` block per owner. Commit `a3c4e960`.
- Step 5/6 UI + Step 7 threshold definitions were **already present** in the codebase before this session — no work needed there.

### Lambda incident recovery
- **SS-4 Lambda** (`ss4-lambda-s3-complete`, python3.9 x86_64): was broken since 2026-04-07 (28KB stub, missing reportlab+PyPDF2, wrong handler). Rebuilt to 4.5MB, handler fixed, published v1, aliased `prod`. AWS-side only (not in git).
- **8821 Lambda** (`Fill8821Lambda-arm64`, python3.11 arm64): same class of bug + `form_data` NameError (parameter is `data`) + missing `datetime` import. Rebuilt 2.4MB, handler fixed, source patched in git, published v1, aliased `prod`. Source fix in commit `8fc183dc`.

### CI safeguards (`ed3852b3` + `8fc183dc`)
- `.github/workflows/lambda-monitoring.yml` — now flags any 5xx (not just HTTP 000)
- `.github/workflows/deploy-lambda-reusable.yml` — reusable workflow_call recipe
- `.github/workflows/deploy-ss4-lambda.yml` + `.github/workflows/deploy-8821-lambda.yml` — auto-deploy on `lambda-functions/<file>.py` changes

**Action required (user):** add `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` to GitHub repo secrets. Until then the deploy workflows exist but can't run.

---

## Full commit list this session (chronological)

```
a45429a5  fix: auto-resolve county from address + force Times New Roman
0affcdda  fix: Avenida Legal address fallback when hasUsaAddress=No
50126820  fix: title-case county + first "th" fix attempt
9d09b6d3  fix: strip superscript-th run after principal_address
dde16cc3  fix: number Article II sub-items, list officers inline, strip trailing director comma
178006a2  fix: poll for post-payment documents so SS-4 appears without refresh
ef5db103  fix: defaults + tooltips for non-compete and ROFR (TODOs 1-4)
ed3852b3  ci: auto-deploy SS-4 Lambda + detect 5xx in health check
8fc183dc  fix(8821): rename form_data->data in create_overlay + import datetime
a3c4e960  feat(agreement): render per-owner Specific Responsibilities section
8b752341  test(e2e): exercise Specific Responsibilities feature in Corp + LLC E2Es
75e0b4e2  fix(agreement): v2 report items #1, #7, #10, #11/12, #13, #16, #17
60807b5f  test(e2e): use $25k spending threshold + v2 audit script
```

---

## Verification status — what's proven end-to-end vs. only structurally

### Proven end-to-end (Playwright UI → Stripe webhook → docgen → S3 → programmatic audit)
- Font Arial → TNR (styles + theme + document — 0 non-TNR refs)
- County populates as "Miami-Dade County" for hasUsaAddress=No path
- No superscript "th" artifact after `{{principal_address}}`
- Article II sub-items numbered 2.1/2.2/2.3/2.4
- Officers listed inline with titles
- Director list has no trailing comma
- Specific Responsibilities section renders (Corp + LLC)
- $25,000 renders as `$25,000.00` (not `$225,000.00`)
- Capital table: `tblW=9000` twips, `tblLayout fixed`, correct gridCols
- § 9.2 romanette paragraphs: no wide 8640 tabs remain, hanging indent present
- `[SIGNATURE PAGE BELOW]` heading absent
- Signature block: owner titles ("Chief Executive Officer") appear under Name lines, no bare "Owner" text

### Proven visually (Playwright screenshot)
- #1 President warning flips to "✓ Presidente asignado" — Step 3 admin screenshot confirmed

### NOT visually verified in a rendered doc
The 7 v2 fixes were verified through XML structural assertions on the generated `.docx`, NOT by opening the doc in Word/LibreOffice and looking at the rendered page. **User called this out — I did not complete the visual verification pass before the session interrupted.**

The audit doc is at `C:\Users\neotr\Downloads\PROD_V2_AUDIT.docx` (generated 2026-04-20 11:10:10 via full Stripe flow, 535,850 bytes). Also `PROD_WEBHOOK_CORP_RESP.docx` from an earlier run.

Pending visual checks needed:
1. § 4.2 capital table — visually inside page margins?
2. § 9.2 Involuntary Transfer list — list marker + text on same line?
3. Signature block — "Chief Executive Officer" formatted correctly under "Name:"?
4. End of doc — is there a blank page anywhere after removing [SIGNATURE PAGE BELOW]?
5. Fonts — everything visually TNR?

**Options for visual verification:**
- Open the .docx in Word/WPS locally and page through
- Install LibreOffice (`winget install LibreOffice.LibreOffice`) and headless-convert to PDF
- Use Google Docs viewer with an S3 presigned URL
- Re-run the full Playwright script (it has a Google Docs viewer screenshot phase; last time I stopped it early)

---

## Environment notes

- **OS:** Windows 11 + Git Bash (no `zip`, no local Python 3.9 for reportlab, no LibreOffice)
- **Fallback for building Lambda packages:** WSL Ubuntu with `pip3 install --target . reportlab PyPDF2` + `python3 zipfile` (no `zip` command needed)
- **Docker Desktop:** installed but daemon was NOT running during the SS-4 rebuild
- **AWS profile:** `llc-admin`, region `us-west-1`
- **Airtable base:** `Formations` table

Test companies still in S3 (audit these anytime):
- `s3://avenida-legal-documents/playwright-qa-corp-dgvzdctl/` — 7 Corp docs, verified 13/13
- `s3://avenida-legal-documents/playwright-qa-llc-llc-dgvzdctl/` — 6 LLC docs, all present

---

## To resume in a fresh Claude Code CLI

```bash
cd /c/Users/neotr/Documents/AvenidaLegal/CompanyFormationQuestionnaire
git log --oneline main -15
```

Then load context:
```
Continuing Avenida Legal work. Read C:\Users\neotr\Desktop\SESSION_HANDOFF_2026-04-20.md
for what's shipped, what's tested, and what's still pending.

Latest commit is 60807b5f. All 17 v2 TODOs + Specific Responsibilities
feature are DEPLOYED but the 7 v2 batch-2 fixes are XML-verified only —
NOT visually verified in a rendered doc. Do the visual check next.
```

### Quick-commands cheat sheet

- **Re-audit newest prod doc:** `node scripts/verify-v2-all-fixes.mjs`
- **Local smoke test v2 fixes:** `npx tsx scripts/smoke-v2-fixes.ts`
- **Local smoke county resolver:** `npx tsx scripts/smoke-county.ts`
- **Local smoke mapper:** `npx tsx scripts/smoke-mapper.ts`
- **Local smoke responsibilities:** `npx tsx scripts/smoke-responsibilities.ts`
- **Full Corp E2E (10 min, generates real doc via Stripe webhook):** `node scripts/e2e-corp-full.mjs`
- **Full LLC E2E:** `node scripts/e2e-llc-full.mjs`
- **All-docs post-formation audit:** `node scripts/verify-all-docs.mjs`
- **Regenerate demo docs:** `npx tsx scripts/gen-demo.ts` → `~/Downloads/DEMO_*.docx`

### Rollback procedures
- **Vercel:** revert commit + push (auto-deploys)
- **SS-4 Lambda:**
  ```bash
  aws lambda update-alias --function-name ss4-lambda-s3-complete \
    --name prod --function-version 1 --profile llc-admin --region us-west-1
  ```
- **8821 Lambda:** same with `Fill8821Lambda-arm64`

---

## Open items (prioritized for next session)

### P0 — user-blocked
1. Add `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` to GitHub repo secrets so `deploy-*-lambda.yml` workflows can run.

### P1 — visual verification (this is what got interrupted)
2. Open `PROD_V2_AUDIT.docx` in Word/WPS or convert via LibreOffice, screenshot the sections listed above (§ 4.2 table, § 9.2 list, signature block, end of doc, font rendering). Confirm XML fixes translate to correct visual rendering.

### P2 — product / longer-term
3. Extend the auto-deploy CI pattern to the other 5 doc Lambdas (Bylaws, OrgRes, ShReg, MemReg, 2848) — they're currently healthy but unprotected against a repeat of the 2026-04-07 stripped-deploy incident.
4. Migrate agreement docgen from `docxtemplater` (JS) to `python-docx` Lambda — matches the pattern of the other 5 doc generators and permanently fixes Word Online rendering compatibility.
5. Per-shareholder-count Corp templates (1–6 owner variants) matching Bylaws/OrgRes shape.
6. Formation-wide audit job: post-payment, verify all expected docs exist within N minutes; alert if missing. Prevents silent-failure class of bugs structurally.

---

## Key files touched

**Docgen + mapper**
- `src/lib/agreement-docgen.ts` (large — most new helpers here: `fixCapitalTableWidth`, `fixSection92ListIndent`, `removeSignaturePageBelowHeading`, `rewriteSignatureOwnerLabel`, `prefixArticle2Subsections`, `injectResponsibilitiesSection`, `forceTimesNewRomanFont`)
- `src/lib/agreement-mapper.ts` (async now, reads county + responsibilities)
- `src/lib/county-lookup.ts` (new — ports SS-4's `city_to_county` to TS)

**UI**
- `src/components/steps/Step5Admin.tsx` (reactive President warnings)
- `src/components/steps/Step8Agreement3.tsx` (non-compete defaults + tooltips)
- `src/components/steps/Step9Agreement4.tsx` (ROFR default 60)

**API routes**
- `src/app/api/webhooks/stripe/route.ts` (await mapper)
- `src/app/api/agreement/generate/route.ts` (await mapper)
- `src/app/client/page.tsx` (post-payment polling)

**Lambda source**
- `lambda-functions/8821_lambda_s3_complete.py` (data/form_data rename + datetime import)

**CI**
- `.github/workflows/lambda-monitoring.yml`
- `.github/workflows/deploy-lambda-reusable.yml` (new)
- `.github/workflows/deploy-ss4-lambda.yml` (new)
- `.github/workflows/deploy-8821-lambda.yml` (new)

**Test scripts (all new)**
- `scripts/smoke-county.ts`
- `scripts/smoke-mapper.ts`
- `scripts/smoke-responsibilities.ts`
- `scripts/smoke-v2-fixes.ts`
- `scripts/verify-all-docs.mjs`
- `scripts/verify-prod-agreement.mjs`
- `scripts/verify-prod-noaddr.mjs`
- `scripts/verify-prod-responsibilities.mjs`
- `scripts/verify-v2-all-fixes.mjs`

**Modified**
- `scripts/e2e-corp-full.mjs` (responsibilities + $25k reproducer)
- `scripts/e2e-llc-full.mjs` (roles)
