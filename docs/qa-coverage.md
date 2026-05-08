# Agreement-Generation QA Coverage

Three complementary layers cover the LLC + Corp agreement-generation pipeline.
Run cost vs. signal trade-off — start cheap, escalate only when needed.

| Layer | What it checks | Cost | Run when |
|------:|:--------------|:----:|:--------|
| **1. Mechanical audit** (`scripts/audit-all-variants.ts`) | 288 variants × XML structure: hierarchy, run shape, completeness, layout, cross-refs | ~25s, $0 | Every PR (CI, blocking); every local change |
| **2. Pairwise UI sweep** (`scripts/qa-ui-pipeline.mjs --matrix=pairwise`) | 26 variants pairwise-cover 14 axes, end-to-end through prod (Auth0 → Stripe → webhook → Word Online), 17 page screenshots / variant | ~2.5h, real Stripe/Auth0 | Before tagging a release; after webhook/checkout/Lambda changes |
| **3. Visual review** (`scripts/visual-review-corp-variants.mjs`) | Per-page Claude Haiku 4.5 vision over rendered PDF | ~30 min, ~$5 | After non-trivial template/transform changes |

## Variant matrix (288 = full)

| Axis | Values | Count |
|---|---|---|
| Entity | Corp, LLC | 2 |
| Owners | 1, 2, 3, 4, 5, 6 | 6 |
| Voting | majority, mixed, unanimous | 3 |
| Covenants (RoFR/Drag/Tag/NC/NS/Conf) | flag combinations from `agreement-variants.mjs` | 8 |

**Total**: 2 × 6 × 3 × 8 = 288 mechanical variants.

## Pairwise sweep (26 = orthogonal sample)

The pairwise generator (`scripts/lib/pairwise.mjs`, greedy IPOG-like) covers 14 axes
in 26 cases including axes the audit doesn't exercise (distribution frequency,
loans, transferToRelatives, etc.). Not a strict subset of the 288 — orthogonal.

## Out of scope (not exercised by current QA)

- **State-by-state law variations**: only the agreement-text generator is audited.
  State-specific overlays (Delaware franchise tax, NY publication, etc.) are
  applied downstream by separate Lambdas and have their own batch tests
  (`scripts/batch-test-lambdas.mjs`).
- **>6 owners**: agreement template caps at 6 shareholders/members. Form
  rejects 7+ at the UI layer.
- **Mixed entity types in one base**: agreements assume all owners are personas
  or all empresas. Mixed cases handled at the form layer; not audited.
- **Corp where managers ≠ officers**: the form supports separate manager and
  officer designations, but the agreement template only renders officers.
  Audit covers the rendered output, not the form-level mismatch.
- **Ad-hoc text fields** (`llc_specificTerms`, `corp_specificResponsibilities`):
  free-text fields the audit cannot validate semantically. Layout is checked
  but not content.

## Drift detection

`tests/__snapshots__/audit-baseline.json` holds the canonical 288/288 PASS
state. CI runs `scripts/audit-drift-check.ts` on every PR comparing current
audit output to the baseline; fails on any PASS→FAIL regression.

To intentionally update the baseline (after a known-good change):

```bash
npx tsx scripts/audit-all-variants.ts --out=tests/__snapshots__/audit-baseline.json
git add tests/__snapshots__/audit-baseline.json
```

Include the baseline update in the PR alongside the source change.

## Reports

The variant-matrix report (`scripts/generate-variant-matrix-report.ts`)
produces CSV + HTML for human review. CSV opens in Excel with native
filter/sort. HTML is sortable, filterable, color-coded.

Defaults to reading `~/Downloads/audit-all/audit-all-results.json` and writes
to `~/Downloads/variant-matrix/<timestamp>/`. Pass `--ui=path-to-results.json`
to merge UI-sweep results into the same artifact.
