# Antonio review prep — 4 open agreement items (Tue 2026-05-26)

Prepared 2026-05-24. "Before" text below is from **prod output** (UAT run `u524a`, commit `c2e693e0`).

> **Update 2026-05-25 (commit `cf27de03`, deployed):** UAT surfaced two real BUGS adjacent to these items, now FIXED + shipped (prod-verified): (1) supermajority docs had a **duplicate/contradictory "Super Majority Defined"** (§19.7 vs §19.8) and unanimous docs had broken **"Unanimous of the Managers"** grammar — both resolved by keeping the LLC §19.7/§19.8 glossary fixed (mirroring Corp §1.6/§1.7); (2) **director/manager name lists** now use a proper serial comma. The items below are the remaining **judgment calls** for Antonio (structure + wording), not bugs.

Affected docs: **LLC = Operating Agreement**, **Corp = Shareholders' Agreement** (`src/lib/agreement-docgen.ts`).

---

## Item 1 — LLC §19.7 "Defined" block: grammar + structure

**Where:** LLC Operating Agreement, definitions tail (§19.7–§19.8). LLC-specific (Corp defines its term cleanly at §1.6, see below).

**Current (unanimous-voting variant, v9 — real output):**
```
19.7  Unanimous Defined.
  i.   Unanimous of the Managers.  Managers collectively representing 100% of all the Managers.
  ii.  Unanimous of Members.  Members collectively holding 100% of the total MPI held by all Members.
19.8  Super Majority Defined. Members collectively holding greater than SEVENTY-FIVE PERCENT (75.00%) of the total MPI held by all Members.
```
For comparison, a **majority** variant renders §19.7 as `Majority Defined.` / `Majority of the Managers.` / `Majority of Members.` — which read correctly because "Majority" is a noun.

**⚠️ This is now also a confirmed BUG, not just a style choice** — UAT u524a (2026-05-24) surfaced two concrete defects from the same root cause:

**SUPERMAJORITY variant (real output, v13) — duplicate + contradictory definition:**
```
19.7  Super Majority Defined.
  i.   Super Majority of the Managers.  Managers collectively representing at least 50.01% of all the Managers.
  ii.  Super Majority of Members.  Members collectively holding at least 50.01% of the total MPI held by all Members.
19.8  Super Majority Defined. Members collectively holding greater than 75.00% of the total MPI held by all Members.
```
→ The agreement now has **two sections titled "Super Majority Defined" with conflicting thresholds** — §19.7 says Super Majority = **50.01%**, §19.8 says **75.00%**. The 50.01% (the *majority* threshold) is mislabeled as "Super Majority". This ships a wrong legal definition to every supermajority-voting client.

**Three problems (root cause: the voting word-swap "Majority"→chosen term also rewrites the §19.7/§19.8 glossary):**
1. **Broken grammar / wrong threshold.** Unanimous → "Unanimous Defined / Unanimous of the Managers / of Members" (adjective used as noun). Supermajority → the duplicate "Super Majority Defined @ 50.01%" above. (Majority and Mixed variants are clean — the base term isn't swept there.)
2. **Asymmetric structure.** §19.7 splits into two sub-items (i. Managers / ii. Members); §19.8 "Super Majority" is a single inline sentence (Members only, no Manager threshold).
3. **Irrelevant leftover definition.** §19.8 "Super Majority Defined" still appears even when the client chose Unanimous — defining a threshold the agreement never uses.

> The **Corp agreement already does this correctly**: §1.6 "Majority." / §1.7 "Super Majority." stay as clean, fixed noun definitions regardless of the client's chosen voting (verified v20/v69). Option A below = apply the Corp's behavior to the LLC.

**Options (Antonio picks):**
- **A — Keep the glossary fixed, swap only the body. ✅ DONE (shipped `cf27de03`).** §19.7 "Majority Defined" (50.01%) and §19.8 "Super Majority Defined" (75%) now stay as standing glossary terms for every voting choice; only the *operative* voting references in the clauses swap. This is what's now live — it fixes the supermajority duplicate and the unanimous grammar. **Antonio only needs to weigh in if he prefers B or C instead.**
- **B — Use a noun form of the chosen term.** Swap to a proper noun: "**Unanimity** Defined." / "**Unanimity** of the Managers." etc. Keeps the swap behavior but fixes grammar.
- **C — Restructure into parallel sections.** Promote each definition to its own numbered section (e.g. 19.7 Majority of the Managers / 19.8 Majority of Members / 19.9 Super Majority), and drop the threshold(s) not chosen.

> Note: the `(i)`/`(ii)` → `i.`/`ii.` label fix (numbering convention) already shipped — labels are correct now. This item is about wording + structure only.

---

## Item 2 — Unanimous wording: "by Unanimous vote" vs "unanimously"

**Where:** body clauses of both agreements when the client picks Unanimous voting.

**Current (v9, real output):** most of the body already reads acceptably after prior fixes —
`"…may determine by Unanimous vote."`, `"…approved by a Unanimous vote of the Members"`, `"…with the Unanimous consent of the Members"`, `"…(by Unanimous vote)"`, `"…by the Unanimous vote or consent of the Members"`.

**Status after raw-XML recheck (2026-05-25):** of the spots first flagged, only ONE was a genuine break — now FIXED + shipped (`948e2160`, prod-verified):
- ✅ Corp §12.1 Removal (unanimous): was `"…by the written consent of Unanimous consent of the Shareholders"` (doubled "consent of") → now `"…by the written Unanimous consent of the Shareholders."` Fixed.
- ✓ Corp §11.7 Emergency Meetings already renders correctly: `"The Unanimous consent of the Board of Directors or the Unanimous consent of the Shareholders…"` (an earlier 150-DPI screenshot misread led to a false alarm).
- ✓ Corp §2.4 already correct: `"…as the Shareholders may choose by Unanimous vote."` (the "by" is present — also a misread).

**The only remaining stylistic question for Antonio:** the system currently renders unanimous voting as "**by Unanimous vote**" / "**Unanimous consent of** the Members" (reads acceptably), and one spot reads `"…the Managers shall vote on Company matters **by Unanimous decision**."` Do you want to keep this register, or normalize everything to "**unanimously / by unanimous consent**"? (Recommendation: keep current + we can soften "by Unanimous decision" → "by unanimous consent" if you like.)

**Decision:** is "by Unanimous vote / by the Unanimous vote or consent" the wording you want (it currently reads fine), or should we normalize to "**unanimously**" / "**by unanimous consent**" throughout?

**Options:**
- **A — Keep "by Unanimous vote" (current).** Reads acceptably; lowest risk. Only residual spot is "by Unanimous decision" (§11.1.B), softenable to "by unanimous consent". (§11.7/§12.1/§2.4 are already correct — see status above.)
- **B — Normalize to "unanimously / unanimous consent."** More natural legal English (e.g. "may determine unanimously", "approved unanimously by the Members"). Larger sweep, more strings to verify.

Recommendation: **A** plus cleaning the two residual phrasings — unless you prefer the "unanimously" register.

---

## Item 3 — "[SIGNATURE PAGE …]" marker: consistency + page break

**Where:** end of both agreements, just before "IN WITNESS WHEREOF".

**Current (real output):**
- **Corp (v10):** `[SIGNATURE PAGE BELOW]`
- **LLC (v9):** `[SIGNATURE PAGE TO FOLLOW]`

Inspecting the rendered XML: the **Corp** template ships a real `<w:br w:type="page"/>` before "IN WITNESS WHEREOF" (signatures on their own page — deliberate); the **LLC** template did **not**, so LLC signatures fell on the same page and the "TO FOLLOW" marker was misleading.

**✅ FIXED + shipped (`5fc93d56`):** the signature handler now forces the LLC signature block onto its own page when no page break already exists (guarded so the Corp — which already has the `<w:br>` — is not double-broken). Verified by render: LLC marker is now the last line of the preceding page, signatures begin on the next page — matching the Corp. The page-break behavior is now consistent across both entities.

**Remaining (optional, cosmetic) for Antonio:** the marker **wording** still differs (Corp `[SIGNATURE PAGE BELOW]` / LLC `[SIGNATURE PAGE TO FOLLOW]`). I left this as-is because the Corp's keep-together handler matches the literal "[SIGNATURE PAGE BELOW]" — standardizing the wording is a one-line change once you pick. Options: standardize both to "TO FOLLOW" (most accurate now that a page always follows), keep per-entity, or drop the marker entirely (treat as an internal drafting note).

---

## Item 4 — Incapacity / heirs question: wording + the buyer party

**Where:** questionnaire Step 9 (`Step9Agreement4.tsx`), toggle `corp_incapacityHeirsPolicy` / `llc_incapacityHeirsPolicy` → maps to `death_incapacity_forced_sale`. Clause renders at §14.x.

**Current — the on-screen question contradicts its own tooltip, and the Corp Spanish is grammatically broken:**

| | Question shown to user | Tooltip explanation |
|---|---|---|
| **Corp** | "…¿querrá que los herederos estén obligados a vender las acciones a **los accionistas compañía**?" *(broken: should be "a la compañía" or "a los accionistas de la compañía")* | "…deben vender sus acciones **a la corporación**…" |
| **LLC** | "…¿Los herederos estarán obligados a vender su participación a **los otros socios de la LLC**?" | "…deben vender sus participaciones **a la LLC**…" |

So the question says heirs sell **to the other shareholders/members**, while the tooltip says **to the corporation/LLC**. These must agree, and must match whom the §14 clause actually names as buyer.

**Decision for Antonio:** when this is "Yes", who is obligated/entitled to buy the deceased-or-incapacitated holder's interest — **the entity (corporation/LLC) itself**, **the other holders pro-rata**, or **either at the entity's option**? Then I'll align (a) the question text, (b) the tooltip, (c) the §14 clause, and (d) fix the Corp Spanish grammar ("a los accionistas compañía").

---

### Status
- Items 1, 3, 4 fully grounded in current prod output. Item 2 LLC grounded; Corp-unanimous strings to be appended.
- Nothing here is shipped yet — awaiting Antonio's choices so we don't guess on legal text.
