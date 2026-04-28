# Agreement QA — automated detect/fix/verify strategy

## Why this exists
Every visual bug we found by eye in this session (orphan headings, mislabeled levels, period inside underlined run, leading tabs, sig-block misalignment, combined Name/Title, etc.) is a **mechanical XML smell** that a script can detect. Manual screenshot review doesn't scale to 250 variants × LLC + Corp.

## The four-layer verification stack

Each layer is **fail-fast**: any breach blocks the build. Layers run on every generation.

### Layer 1 — Hierarchy / labels (`scripts/audit-corp-structure.mjs`)
- 1.N → A. → i. — labels match indent level
- Sequences contiguous (no `(b)` without `(a)`, no `ii.` without `i.`)
- Every Article/Heading2/Heading3 paragraph carries `keepNext=1`
- Every pre-table paragraph carries `keepNext=1`

### Layer 2 — Run / formatting smells (NEW, additive to Layer 1)
For every numbered heading paragraph (`§N.M Title`):
- First run is `<w:t>N.M </w:t>` un-underlined, single trailing space
- Second run is the title, **underlined**
- Title text does NOT end in `.` (period belongs to body run)
- Body run starts with `.` followed by 2+ spaces — no `<w:tab/>` in body
- No leading `<w:tab/>` in any run except the canonical label-tab pattern at level 2/3
- pPr: `<w:ind w:left="1440" w:hanging="1440"/>` for headings, exact-match-or-flag

For every level-2 letter paragraph:
- `<w:tab/><w:t>X.</w:t><w:tab/><w:t>body</w:t>` — exactly one leading tab, exactly one between label and body
- pPr: `<w:ind w:left="2160" w:hanging="720"/>`

For every level-3 roman paragraph:
- Same pattern, `<w:ind w:left="2880" w:hanging="720"/>`

### Layer 3 — Section completeness
- No empty Heading3 (a title with no body — §13.1 RoFR was this)
- No body paragraph that's an obvious list item without a label (heuristic: starts with "If…", "The…", "Subject to…" inside a section that ends `:`)
- No combined paragraphs containing more than one labeled chunk (e.g., "Name:X Title:Y")

### Layer 4 — Layout sanity
- Pre-table paragraph: empty paragraph between heading and table must NOT have `pageBreakBefore=1` (pageBreakBefore belongs on the heading)
- Signature block: every paragraph from the curly-quoted "SHAREHOLDERS" header to `</w:body>` must have identical effective left position (left + firstLine − hanging + leading-tab-count × 720 == constant)

## The fix loop
```
detect → if issues → apply auto-fixers → re-detect
       → if still issues → fail with stable diagnostic
       → if clean → emit DOCX
```
Auto-fixers are the existing transforms in `agreement-docgen.ts` plus new ones added in lock-step with new detectors. Detector + fixer always ship together.

## Variant coverage
- `scripts/verify-all-variants.mjs` already enumerates 250 Corp variants
- Each variant runs the full Layer 1–4 audit
- Build fails if any variant produces a non-clean DOCX

LLC: identical strategy — every detector and fixer needs an LLC counterpart wired through the same loop. Audit script is template-agnostic; transforms are template-specific.

## Visual regression (last line of defense)
- `scripts/qa-pipeline.mjs` already screenshots Word Online per page for the Group D 16-variant matrix
- Add: pixel-diff against golden snapshots for top 10 critical pages (cover, capital table, sig block, every Article opening)
- A clean Layer 1–4 audit should always produce a clean visual diff. If they disagree, it's a Layer 1–4 gap and we add a detector.

## What this prevents
The session's 20+ manual fixes all map to specific Layer 1–4 detectors:
- §3.2 dissolution voting-anchor → Layer 2 (label injection deterministic)
- §10.5 underlined title in single run → Layer 2 (title-must-not-end-with-period)
- §10.7 no title at all → Layer 3 (no-body-without-heading-context)
- §13.1 empty heading → Layer 3
- Combined Name/Title → Layer 3
- Sig block misalignment → Layer 4
- Orphan ARTICLE VI → Layer 1 (already enforced)

## How we know it works
A passing audit on a representative variant + the 250-variant matrix passing + visual snapshots stable = no manual review needed for that release. Any new template revision triggers a re-baseline of Layers 2–4 and visual snapshots.
