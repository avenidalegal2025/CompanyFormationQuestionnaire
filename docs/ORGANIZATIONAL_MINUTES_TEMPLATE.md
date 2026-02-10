# Organizational Minutes (C-Corp) Template

## Source and template

- **Source:** Gym Kidz in Miami Lakes Inc. organizational minutes was turned into a template and uploaded to S3.
- **Script:** `scripts/create-organizational-minutes-template.py` — run with optional path to a source DOCX; default source: `organizational-resolution-inc/organizational-minutes-gym-kidz-SOURCE.docx`. Creates `organizational-minutes-inc-1.docx` and uploads to S3, then copies to `organizational-minutes-inc-2.docx` … `organizational-minutes-inc-6.docx`.
- **S3:** `s3://company-formation-template-llc-and-inc/templates/organizational-resolution-inc/organizational-minutes-inc-{1..6}.docx`
- **API:** For C-Corp/S-Corp, `POST /api/airtable/generate-organizational-resolution` uses the **organizational-minutes-inc-** template (not the old organizational-resolution-inc-).

---

## How the current C-Corp "Organizational Resolution" is wired

1. **API:** `POST /api/airtable/generate-organizational-resolution`  
   - Body: `{ recordId, updateAirtable? }`
2. **Entity type:** Only runs for `Entity Type` = `C-Corp` or `S-Corp` (and LLC; we’re focusing on corp here).
3. **Data:** `mapAirtableToCorpOrganizationalResolution(record)` in `src/lib/airtable-to-forms.ts` builds:
   - `companyName`, `companyAddress`, `formationState`, `formationDate`
   - `members` (from Owners: name, address, ownershipPercent)
   - `managers` (from Officers; fallback to first owner if no officers)
4. **Template:** For corps the template path is:
   - `templates/organizational-resolution-inc/organizational-resolution-inc-{1..6}.docx`  
   by member (owner) count.  
   Template base URL: `https://${TEMPLATE_BUCKET}.s3.${AWS_REGION}.amazonaws.com`
5. **Lambda:** `LAMBDA_ORGANIZATIONAL_RESOLUTION_URL` — same Lambda as LLC; it fills placeholders and returns DOCX.

---

## Placeholders the Lambda replaces (use these in the new template)

Use these exact placeholders in the Word template so the existing Lambda works without code changes:

| Placeholder | Meaning |
|-------------|--------|
| `{{COMPANY_NAME}}` | Company name (bold in body) |
| `{{COMPANY_ADDRESS}}` | Full company address |
| `{{FORMATION_STATE}}` | State of formation (e.g. Florida) |
| `{{FORMATION_DATE}}` | Formation date, word form (e.g. *eighth day of February, 2026*) |
| `{{Date_of_formation_LLC}}` | Same as FORMATION_DATE (legacy) |
| `{{member_1_full_name}}` or `{{Member_1_full_name}}` | First owner/shareholder name |
| `{{member_2_full_name}}` … `{{member_6_full_name}}` | Additional owners (if present) |
| `{{member_1_pct}}` … `{{member_6_pct}}` | Ownership % (e.g. 100% or 50%) |
| `{{manager_1_full_name}}` or `{{Manager_1}}` | First officer (e.g. President) |
| `{{manager_2_full_name}}` … `{{Manager_6}}` | Additional officers |

- **IN WITNESS WHEREOF** block: the Lambda will replace the date in that block with a **numeric ordinal** (e.g. *8th day of February, 2026*). You can keep a placeholder or a sample date there; the Lambda overwrites it.

---

## Turning the Gym Kids Miami doc into the template

1. **Copy the source DOCX** (e.g. `gym-kids-miami-organizational-minutes-SOURCE.docx`) into `organizational-resolution-inc/` or a new folder like `organizational-resolution-inc/minutes/`.
2. **Replace all company-specific text** with placeholders:
   - Company name (e.g. "Gym Kids" or "Gym Kids Miami LLC/Inc") → `{{COMPANY_NAME}}`
   - Company address → `{{COMPANY_ADDRESS}}`
   - State → `{{FORMATION_STATE}}`
   - Date (formation / meeting date) → `{{FORMATION_DATE}}` or `{{Date_of_formation_LLC}}`
   - Shareholder/owner names → `{{member_1_full_name}}`, `{{member_2_full_name}}`, …
   - Ownership % → `{{member_1_pct}}`, `{{member_2_pct}}`, …
   - Officer names (President, etc.) → `{{Manager_1}}`, `{{Manager_2}}`, …
3. **Save as** the template(s) to use for corps, e.g.:
   - `organizational-resolution-inc/organizational-minutes-inc-1.docx` (1 owner)
   - … up to `organizational-minutes-inc-6.docx` if you need different versions by owner count (like the current resolution files).
4. **Upload** these to the same S3 template bucket and path used for `ORGANIZATIONAL_RESOLUTION_INC_TEMPLATE_BASE_PATH` (e.g. `templates/organizational-resolution-inc/`).

---

## Wiring the new template into the app

**Option A – Replace current C-Corp resolution with “minutes” (one template per owner count)**  
In `src/app/api/airtable/generate-organizational-resolution/route.ts`, the template path for corps is:

```ts
const templatePath = entityType === 'LLC'
  ? getOrganizationalResolutionTemplateName(...)
  : `${CORPORATE_TEMPLATE_BASE_PATH}/organizational-resolution-inc-${Math.min(Math.max(orgResolutionData.memberCount || 1, 1), 6)}.docx`;
```

Change the corp branch to use the new filenames, e.g.:

```ts
: `${CORPORATE_TEMPLATE_BASE_PATH}/organizational-minutes-inc-${Math.min(Math.max(orgResolutionData.memberCount || 1, 1), 6)}.docx`;
```

Then upload `organizational-minutes-inc-1.docx` … `organizational-minutes-inc-6.docx` to S3 at that base path. No Lambda changes needed if placeholders match.

**Option B – Keep “Organizational Resolution” for corps and add “Organizational Minutes” as a separate document**  
- Add a new doc type (e.g. `organizational-minutes`) and a new API route (e.g. `generate-organizational-minutes`) that uses the new template(s).
- That would require more wiring (Airtable field, Stripe webhook doc list, client dashboard, etc.). Prefer Option A unless you need both resolution and minutes as separate docs.

---

## Summary

- **Document:** “Gym Kids Miami” organizational minutes was **not found** in the repo. Add the source DOCX to the repo or share its path.
- **Template:** Once we have the source, replace company-specific text with the placeholders above and save as `organizational-minutes-inc-1.docx` (and 2–6 if needed).
- **Wiring:** Point the existing C-Corp branch in `generate-organizational-resolution` at the new template path and upload the new DOCX files to S3; the same Lambda will fill them.
