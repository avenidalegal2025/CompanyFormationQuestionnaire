# Avenida Legal — Session Handoff (2026-08-23)

**Repo:** `C:\Users\neotr\Documents\AvenidaLegal\CompanyFormationQuestionnaire`
**Live app:** https://company-formation-questionnaire.vercel.app
**HEAD:** `cdd2dba5` on `main` — committed **2026-08-23**, pushed and deployed to Production (READY 06:21 UTC).
Prior HEAD was `adab2e0f` (2026-06-30), which had stood untouched for ~8 weeks.
**Working tree:** clean except `tsconfig.tsbuildinfo` (build artifact) and this handoff file

> **Supersedes `SESSION_HANDOFF_2026-04-20.md`.** That document described commit `60807b5f`,
> which is **159 commits behind HEAD**. Its "next task = visually verify the 7 v2 batch-2 fixes"
> is obsolete — that work was absorbed by the numbering/layout program and the QA pipeline built
> in May. Keep the April file only as history; do **not** resume from it.

---

## Read this first

`CLAUDE.md` in the repo root (286 lines) is the living technical contract for this project
and is more authoritative than any handoff. It documents:

- the three-level **numbering convention** (`N.M` → `A.` → `i.`) the docgen enforces
- the **orphan-title / page-break rule** and its `keepNext` mechanism
- all ~30 **generic post-processing passes** in `src/lib/agreement-docgen.ts`
- the **regression suite** (4 layers, table below) and how to refresh baselines
- **WSL `/mnt/c` stale-cache gotcha** — only Node `fs.readFileSync` sees real file bytes;
  `cp`/`md5sum`/`stat` and LibreOffice-on-`/mnt/c` can serve hours-stale content
- the "**do your own QA, never ask the user to verify**" and "**per-page visual QA**" rules

---

## Where the project actually stands

### Verified green as of 2026-08-23 (I ran these, this session)

| Layer | Command | Result |
|---|---|---|
| Toggle coverage | `npx tsx scripts/audit-toggle-coverage.ts` | ✅ 16 toggles · 0 unexpected-dead · 0 pending-Antonio |
| Document snapshots | `npx tsx scripts/test-docgen-snapshots.ts` | ✅ 6/6 match |
| 480-variant matrix | `npx tsx scripts/verify-variant-matrix.ts` | ✅ 480/480 PASS (structure + content) |
| Structural drift (288) | `audit-all-variants.ts --out=/tmp/a.json` → `audit-drift-check.ts` | ✅ No drift (252 PASS / 36 known-FAIL, identical to baseline) |

The 36 baseline FAILs are **not bugs** — they are synthetic `drag ≠ tag` variants the real form
cannot emit (both derive from the single `tagDragRights` toggle). See CLAUDE.md.

### Verified green by CI (not by me)

**Lambda Health Check** has run on schedule roughly every 6 hours and passed continuously
through **2026-08-23 01:16 UTC** (run `32609958710`). All 7 doc Lambdas are responding.
Note this is a liveness ping, not a document-content check.

No non-scheduled CI runs exist in the recent history — i.e. **no PR has been opened since
2026-06-30**, so the PR-gated workflows (Variant Audit, Docgen Regression, Payload Fidelity,
Toggle Coverage, E2E) have not run in ~8 weeks. Their last real exercise was pre-06-30.

### NOT verified — be honest about this

- **No commits in ~8 weeks** (last is 2026-06-30; today is 2026-08-23). Whatever happened
  with the business, product, or the client review in that gap is **not** captured in git and
  is not known to this document.
- **The 06-23 client-review punch list is not fully accounted for.** Three commits reference
  the 2026-06-23 review (`c2f7a01b` SS-4 line 16, `a37d6b13` LLC §14.4, `b9fde47d` items
  **#7–#10**). There is **no punch-list file in the repo**, and **items #1–#6 are not traceable
  to commits by number**. Some are plausibly covered by the two other commits; this cannot be
  confirmed from the repo. **Ask Antonio / check the original review source before assuming closed.**
- **The first paid $1 go-live UAT was never confirmed complete.** See "Go-live" below.
- **No visual (rendered-page) QA has been run since 2026-06-30.**

---

## What shipped since the April handoff (159 commits, 2026-04-20 → 2026-06-30)

Grouped by program of work rather than listing all 159. Full list:
`git log --oneline 60807b5f..HEAD`

### 1. Numbering, hierarchy and layout — the largest program (~60 commits, late Apr)
Enforced the three-level `N.M` → `A.` → `i.` convention across the whole Corp + LLC document
and replaced one-off patches with **generic pattern-class passes**:

- sequential renumbering + **cross-reference remap** so no gaps and no dangling refs
  (`61e2b514`, `dc3f9e48`, `b07eb581`, `5ed65061` generic cross-ref detector/remediator)
- conditional renumbering when whole Articles are stripped by covenant toggles
  (`c09b5069` LLC Art XIX, `f1b9598a` LLC Art XII + Corp 13.2 orphan, `375b28ef`/`a9607c15` Corp non-compete)
- heading shape standardization, fractured-heading rebuild, wrap-line alignment under the
  first body word (`2f944b10`, `8b0d143f`, `2f384685`, `901bb765`)
- list-label canonicalization to bare `A.` / `i.` + indent normalization
  (`164d4df3`, `b35e036b`, `1623c1c3`)
- orphan-title / page-break rule enforced globally (`27638b27`), `keepLines`/`widowControl` (`607f7fd6`)
- §4.2 capital table (bordered overflow rows for 4+ owners, page break, column rebalance)
- signature block layout, owner-order preservation, spacing (`4ca74e0f`, `239ea048`, `0c52fc31`)
- `386538ac` **XML-escape user strings before injection** — security-relevant, not just cosmetic

### 2. QA infrastructure — the thing that makes this project maintainable (~20 commits)
- `aa5169fc` 4-layer structural auditor for the Corp agreement
- `6b68f8fc` → `868167d2` scaled to **288 variants** (144 Corp + 144 LLC), LLC 0/144 → 144/144
- `de526478` **Claude Haiku 4.5 vision review** — DOCX → PDF → PNG → per-page visual review;
  surfaced 2 real bugs the static auditor missed. `51d48741` documents its reliability caveats
  (unreliable on underline-pixel findings; treat those as noise unless XML confirms)
- `3e96b9c6` Word Online per-page screenshots + DOCX assertions
- `b9a1bb50` **toggle-coverage guard** — build fails if a questionnaire toggle is ignored by the doc
- `f983aa7e` golden text-snapshot suite; `eb817475` drift gating instead of raw-audit gating
- `b5c28a5f` → `c2511c49` systematic **480-variant** matrix (2 entities × 6 owner-counts ×
  4 voting profiles × 10 toggle presets) with content-rendering assertions
- `4de07d6f` **Layer 1 live e2e audit** against Vercel — last full run 2026-05-30: **100/100 PASS**
- CI: `c256a592` variant audit on PR, `7f80d6ba` prod-flow verify, `e6552806` payload fidelity

### 3. The "voting sweep" bug class — 4 real bugs, now anchored
The `applyVotingReplacements` text sweep would clobber clauses that must stay at a fixed
threshold. Fixed and locked with **20+ negative-lookbehind absence anchors**:
LLC §14.6 removal-for-cause (`cc50ff72`), Corp §13.8 new-shareholder (`318d3375`),
Corp §3.2.B sale-of-assets (`5fde4e61`), LLC §14.4 successor buyout (`a37d6b13`).
`063dc0c6` added per-entry absence assertions so a no-op sweep entry can't ship silently again.

### 4. Dead toggles wired (the form asked, the document ignored)
`97c0df28` transfer-to-relatives (Antonio's exact §14.4 wording), `7ef49e7a` divorce buyout,
`404b3310` incapacity forced-sale, `95fbb9b5` non-solicitation. Toggle coverage now 16/16.

### 5. Client reviews turned into commits
- **2026-05-15 Antonio review** — `e0f7a087` … `d6a49edd` (#1–#9)
- **2026-05-19 client review** — `c49f60d4` and the `(#10)`–`(#17)` series
- **2026-05-30 PFX21 UAT** — `2ad8a3bb` template typos, `318d3375`
- **2026-06-23 review** — `c2f7a01b`, `a37d6b13`, `b9fde47d` (#7–#10 only — see caveat above)

### 6. Production reliability (early June → 06-30)
- `a97a1f8b` / `62a7d9d1` / `d41cf2ae` — **fast-path webhook**: Airtable stub, DynamoDB template
  docs, and the customized Agreement DOCX all land within seconds so the dashboard isn't empty
- `df27bb0c` + `23fb86ce` — **event-level then atomic session-id idempotency** (killed duplicate formations)
- `aaa14e03` — phone provisioned **before** SS-4 (so forms carry the number), removed a
  `return` that silently aborted the rest of the handler, Sunbiz auto-arms on payment
- `8fba27dd` — Twilio region-wide fallback when FL 305/786 inventory is dry
- `8366b3e1` / `7e2de768` / `896de450` — Sunbiz filer robustness, TEST_CARD decline mode,
  synthetic non-attributable data on test runs
- `6b4be568` + `670bd50c` — lazy-init Stripe so a Production-scoped live key doesn't break Preview builds
- `c2f7a01b` — SS-4 Line 16 bilingual (ES/EN) category matching, manufacturing before retail
- `b9fde47d` — SS-4 presence is a **hard gate** on checkout success; poll cap 60s → 90s
- `adab2e0f` — Google address autocomplete instantiated once (duplicate widgets left required fields empty)

---

## Go-live status — RESOLVED 2026-08-23

The 2026-06-09 runbook UAT **did run**. The live Stripe account contains exactly
**2 charges in its entire history**, both \$1.00, both succeeded:

| Date | Amount | Email |
|---|---|---|
| 2026-06-23 | \$1.00 | `info+59320@avenidalegal.com` |
| 2026-06-30 | \$1.00 | `info+34023834@avenidalegal.com` |

So live keys work, the live webhook path works, and **no real customer has ever
checked out in live mode**.

### The teardown that never happened (fixed 2026-08-23, commit `cdd2dba5`)

`DEMO_DOLLAR=1` and `DEMO_DOLLAR_EMAILS="*"` were left set in Production for
~74 days alongside live Stripe keys. Since `"*"` means *any signed-in user*, the
first real customer to check out would have been charged **\$1.00** instead of the
full formation price. Nobody was affected only because nobody checked out.

Fixed by scoping the allowlist to a domain rather than removing the flag — the UAT
harness signs up a fresh `info+<random>@avenidalegal.com` per run, so an
exact-match entry would have silently stopped matching and charged us full price:

- gate now accepts `exact@address` | `*@domain` | `*`
- Production set to `DEMO_DOLLAR_EMAILS="*@avenidalegal.com"` (verified by `env pull`)
- 14/14 logic cases pass incl. real-customer-full-price, lookalike domain, and
  suffix-append (`evil@avenidalegal.com.attacker.io`) rejection; `tsc` clean

**Before launch:** decide whether `DEMO_DOLLAR` should be removed entirely. It is
currently fail-safe (only Avenida addresses get \$1), but the safest posture for a
real launch is no override in Production at all.

### Two Vercel CLI gotchas found while doing this (CLI 54.1.0, WSL)

1. `vercel env add` creates vars as type **`sensitive`**, which are write-only —
   `vercel env pull` and the API both return `""` for them. This looks exactly like
   "the value failed to save". Do not trust an empty read as proof of an empty value.
   To get a readable var, create it via the REST API with `"type":"encrypted"`.
2. A value with a **leading `@`** is read by the CLI as a legacy secret reference —
   which is why the allowlist convention is `*@domain`, not `@domain`.

Remaining runbook teardown items — still open, may be costing money: a Twilio number
(~\$1.15/mo) and EC2 `i-0764ed6c3bda7a5c2` (should be stopped; a START Lambda brings
it back on demand). `fix/sunbiz-filer-loop` **is merged** into main.

## Open items (prioritized)

### P0 — needs a human decision or a credential
1. ~~Confirm the $1 live UAT~~ — **done 2026-08-23**: it ran twice (06-23, 06-30). Note the
   06-30 phone/Sunbiz reliability fixes shipped *after* the last live charge, so they remain
   unverified against a real payment. Decide whether that warrants one more $1 run.
2. **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in GitHub repo secrets.** Still unresolved —
   I could not verify (the `gh` token lacks secrets read: HTTP 403). Until set,
   `deploy-ss4-lambda.yml` and `deploy-8821-lambda.yml` exist but cannot run.
3. **Recover the 2026-06-23 punch list items #1–#6.** Not in the repo, not traceable by number.

### P1 — verification debt
4. **Run the Layer 1 live e2e audit again.** Last full run 2026-05-30 (100/100). It is now
   ~12 weeks and ~40 commits stale, and it is the only thing that proves Vercel + docgen agree.
   `bash scripts/run-full100.sh` then `node scripts/audit-e2e-docx.mjs <ids>` (~30 min).
5. **Run the Haiku visual review** on the current output. Last review 2026-04-29 (136/144 clean).
   `node scripts/visual-review-corp-variants.mjs` (~30 min, ~$5). Every layout commit since is
   XML-asserted only. Remember the WSL cache-bust pattern in CLAUDE.md before rendering.
6. **Open a throwaway PR** to re-exercise the PR-gated CI workflows, which have not run in 8 weeks.

### P2 — product / structural
7. Extend the auto-deploy CI pattern to the other 5 doc Lambdas (Bylaws, OrgRes, ShReg, MemReg,
   2848) — currently healthy but unprotected against a repeat of the 2026-04-07 stripped-deploy incident.
8. Migrate agreement docgen from `docxtemplater` (JS) to a `python-docx` Lambda to match the
   other 5 generators and settle Word Online rendering compatibility permanently.
9. Formation-wide audit job: post-payment, verify all expected docs exist within N minutes; alert
   if missing. Closes the silent-failure bug class structurally.
10. **Repo hygiene:** the root directory holds ~150 loose files — a dozen `delaware_lambda_*.py`
    variants, ad-hoc `test_*.py`/`test-*.js`, response dumps, `scripts/_*.ts` scratch files, and a
    directory literally named `haven’t`. Worth a cleanup pass before onboarding anyone else.

---

## Quick-command cheat sheet

```bash
cd /mnt/c/Users/neotr/Documents/AvenidaLegal/CompanyFormationQuestionnaire   # WSL
```

**Regression suite — run all four after ANY docgen/mapper/schema edit:**
```bash
npx tsx scripts/audit-toggle-coverage.ts                    # dead-toggle guard
npx tsx scripts/test-docgen-snapshots.ts                    # golden text (--update to accept)
npx tsx scripts/verify-variant-matrix.ts                    # 480 variants, ~2m20s
npx tsx scripts/audit-all-variants.ts --out=/tmp/a.json && \
npx tsx scripts/audit-drift-check.ts \
  --baseline=tests/__snapshots__/audit-baseline.json --current=/tmp/a.json
```

**Audit / visual:**
```bash
node scripts/audit-corp-structure.mjs <file.docx>       # 4-layer XML auditor, ~50ms
npx tsx scripts/audit-corp-variants.ts --save           # 144-variant matrix + save DOCXes
node scripts/visual-review-corp-variants.mjs            # Haiku vision review, ~30m ~$5
node scripts/batch-test-lambdas.mjs [--save-docx]       # 20 Lambda doc variants
```

**Live e2e:**
```bash
bash scripts/run-full100.sh                             # 100 live variants vs Vercel, ~30m
node scripts/audit-e2e-docx.mjs <ids>
node scripts/e2e-uat-edge-variants.mjs 6                # single LLC sole-member UAT
```

**Preview a generated DOCX without Word:** presign the S3 URL → URL-encode → open in
`https://docs.google.com/gview?url=<ENCODED>&embedded=true` (full recipe in CLAUDE.md).

---

## Environment

- **Windows 11.** Two shells in play, and they differ — CLAUDE.md's "Environment Notes" section
  describes the **Git Bash** environment, while its "WSL-specific gotchas" section describes WSL.
  This handoff's commands assume **WSL** (`/mnt/c/...`).
- Git Bash: no `zip` (use PowerShell `Compress-Archive`), no local Python, no Word COM.
- WSL: use `cd <path> && git ...` — never chain `cd` with `;`. `tsx` relative imports need `.js`.
  AWS needs `AWS_CONFIG_FILE` / `AWS_SHARED_CREDENTIALS_FILE` pointed at `/mnt/c/Users/neotr/.aws/`.
- **Playwright pipelines must run from the Windows side** via `cmd.exe /c`, not WSL.
- **The `/mnt/c` stale-cache trap is real and has burned this project before** — only Node
  `fs.readFileSync` forces a true fetch. Never `cp` a DOCX out of `/mnt/c` for rendering.
- AWS profile `llc-admin`, region `us-west-1`. Airtable base: `Formations`.
- Vercel auto-deploys on push to `main`.

## Rollback

- **Vercel:** revert the commit and push (auto-deploys).
- **Lambda alias rollback:**
  ```bash
  aws lambda update-alias --function-name <ss4-lambda-s3-complete|Fill8821Lambda-arm64> \
    --name prod --function-version <N> --profile llc-admin --region us-west-1
  ```

---

## Resume prompt for a fresh CLI session

> Continuing Avenida Legal work.
> Repo: `/mnt/c/Users/neotr/Documents/AvenidaLegal/CompanyFormationQuestionnaire`.
> Read `SESSION_HANDOFF_2026-08-23.md` first, then `CLAUDE.md` (the authoritative technical contract).
>
> HEAD is `adab2e0f`, last committed 2026-06-30 — about 8 weeks stale. All four local regression
> layers were re-run on 2026-08-23 and pass (toggle coverage, 6/6 snapshots, 480/480 matrix,
> no drift). Lambda health checks are green through 2026-08-23.
>
> The open questions are: (1) did the $1 live-Stripe go-live UAT ever run — if not, the 06-30
> phone/Sunbiz reliability fixes are unverified in production; (2) what were items #1–#6 of the
> 2026-06-23 client review, which aren't recorded anywhere in the repo; (3) live e2e and visual
> QA are both ~12 weeks stale. Start by asking me which of those to chase.
