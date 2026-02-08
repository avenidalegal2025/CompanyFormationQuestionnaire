# IN WITNESS WHEREOF by Document

Summary of which formation documents contain "IN WITNESS WHEREOF" (or similar) text and how the date is formatted there.

## Documents that have IN WITNESS WHEREOF

| Document | Wording | Date placeholder | Date format in that block |
|----------|---------|------------------|---------------------------|
| **Organizational Resolution** (LLC & C-Corp) | "IN WITNESS WHEREOF, this Resolution is effective this …" | `{{FORMATION_DATE}}` / `{{Date_of_formation_LLC}}` or literal date | **Numeric ordinal** (e.g. *8th day of February, 2026*) — applied in Lambda for that paragraph only. |
| **Bylaws** (C-Corp / S-Corp) | "IN WITNESS WHEREOF, these bylaws of {{Company Name}} are made effective as of this {{Payment Date}}." | `{{Payment Date}}` | **Numeric ordinal** (e.g. *8th day of February, 2026*) — Bylaws Lambda uses `_format_witness_date()` in that paragraph. |

## Documents that do NOT have IN WITNESS WHEREOF

| Document | Check performed |
|----------|------------------|
| **Shareholder Registry** | All 6 local `.docx` templates under `shareholder-registry/` were searched; **none** contain "IN WITNESS WHEREOF". They use "I hereby certify..." and `{{Payment Date}}` elsewhere. |
| **Membership Registry** | Templates live in S3 (`llc-formation-templates/membership-registry-all-templates/...`). Lambda does not reference "IN WITNESS WHEREOF"; it only replaces `{{FORMATION_DATE}}` and similar. **Not verified inside S3 .docx content** — if a template there ever adds that block, the date would come from the app’s `formatLegalDate` (already numeric ordinal). |

## Implementation notes

- **Organizational Resolution Lambda**: `witness_date` (numeric ordinal) is used only in paragraphs containing "IN WITNESS WHEREOF"; other uses of `{{FORMATION_DATE}}` keep word form when parsed from raw date.
- **Bylaws Lambda**: `_format_witness_date(payment_date)` is used when the paragraph contains "IN WITNESS WHEREOF"; otherwise `payment_date` is used as received (app typically sends `formatLegalDate` = numeric ordinal already).
