/* Layer 1 audit — read the e2e-served DOCXes from
 * Downloads/e2e-uat-edge-variants/, apply matrix-shape content + bug-class
 * assertions per variant config, report per-variant pass/fail.
 *
 * Catches every KNOWN bug class (the 4 surfaced via UAT this session +
 * everything the 480-variant matrix asserts) on the LIVE Vercel-rendered
 * output, instead of locally-generated. Misses NEW bug classes — those need
 * page-by-page review.
 *
 * Usage:
 *   node scripts/audit-e2e-docx.mjs                  # audit all VARIANTS
 *   node scripts/audit-e2e-docx.mjs 12 17 21 23      # audit specific IDs
 *
 * Writes per-variant JSON to /tmp/audit-e2e-docx-results.json. */

import * as fs from "fs";
import * as zlib from "zlib";
import * as path from "path";
import { VARIANTS, NAMES, votingProfile } from "./e2e-uat-edge-variants.mjs";

// Mirror the harness's resolver exactly: e2e-uat-edge-variants.mjs uses
// join(process.env.USERPROFILE || ".", "Downloads", "e2e-uat-edge-variants").
// In WSL USERPROFILE is empty → harness writes to ./Downloads/... (cwd-relative).
const DOWNLOADS = path.join(process.env.USERPROFILE || ".", "Downloads", "e2e-uat-edge-variants");

function txt(buf) {
  let o = 0; const sig = 0x04034b50;
  while (o < buf.length - 4) {
    if (buf.readUInt32LE(o) === sig) {
      const c = buf.readUInt16LE(o + 8), z = buf.readUInt32LE(o + 18),
            fn = buf.readUInt16LE(o + 26), ex = buf.readUInt16LE(o + 28);
      const n = buf.toString("utf8", o + 30, o + 30 + fn);
      const ds = o + 30 + fn + ex;
      if (n === "word/document.xml") {
        const r = buf.subarray(ds, ds + z);
        return (c === 8 ? zlib.inflateRawSync(r) : Buffer.from(r))
          .toString("utf8")
          .replace(/<[^>]+>/g, " ")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
          .replace(/\s+/g, " ");
      }
      o = ds + z;
    } else o++;
  }
  return "";
}

const TERM = { "Mayoría": "Majority", "Supermayoría": "Super Majority", "Decisión Unánime": "Unanimous" };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findDocx(v) {
  // Harness writes filenames: `v<id>_PFX<id>_<entityTag>_-_<DocName>.docx`
  // For 1-2 digit ids harness uses `PFX${id}` padded to 2 ("PFX12"); for 3-digit
  // ids it's "PF100" (label is 'PF100'). Use v.label (always present).
  const entityTag = v.entity === "C-Corp" ? "Corp" : "LLC";
  const docName = v.entity === "C-Corp" ? "Shareholder_Agreement" : "Operating_Agreement";
  return path.join(DOWNLOADS, `v${v.id}_${v.label}_${entityTag}_-_${docName}.docx`);
}

function auditVariant(v) {
  const errors = [];
  const docxPath = findDocx(v);
  if (!fs.existsSync(docxPath)) {
    errors.push(`DOCX missing: ${path.basename(docxPath)}`);
    return errors;
  }
  const t = txt(fs.readFileSync(docxPath));
  const has = (s) => t.includes(s);
  const isCorp = v.entity === "C-Corp";
  const vp = votingProfile(v.voting);

  // ─── Owner presence ────────────────────────────────────────────────────
  // First N names present, names beyond N absent. NAMES[5]="Sofia Flores" so
  // 6-owner variants test the full table.
  const n = v.ownerCount;
  for (let k = 0; k < n; k++) if (!has(NAMES[k])) errors.push(`owner ${k + 1} '${NAMES[k]}' MISSING`);
  for (let k = n; k < NAMES.length; k++) if (has(NAMES[k])) errors.push(`stale owner '${NAMES[k]}' present (n=${n})`);

  // ─── Capital ───────────────────────────────────────────────────────────
  if (!has("$50,000.00")) errors.push("$50,000.00 capital amount missing");

  // ─── Covenant toggles ──────────────────────────────────────────────────
  const ncTerm = isCorp ? "Covenant Against Competition" : "Non-competition";
  if (v.nc === "Yes" && !has(ncTerm)) errors.push(`NC=Yes but '${ncTerm}' missing`);
  if (v.nc === "No" && has(ncTerm)) errors.push(`NC=No but '${ncTerm}' present`);
  if (v.ns === "Yes" && !has("Non-Solicitation")) errors.push("NS=Yes but 'Non-Solicitation' missing");
  if (v.ns === "No" && has("Non-Solicitation")) errors.push("NS=No but 'Non-Solicitation' present");
  // Confidentiality is non-optional (Antonio 2026-05-19) — always forced on.
  if (!has("Confidential Information")) errors.push("Confidential Information missing (should be forced on)");
  if (v.rofr && !has("Right of First Refusal")) errors.push("rofr=true but 'Right of First Refusal' missing");
  if (!v.rofr && has("Right of First Refusal")) errors.push("rofr=false but 'Right of First Refusal' present");
  // drag + tag are coupled in the real form via a single `tagDragRights`
  // toggle (CLAUDE.md). The harness's makeAgreementData sets
  // `tagDragRights: (v.drag || v.tag) ? 'Yes' : 'No'`, so synthetic configs
  // where v.drag !== v.tag render both clauses (or neither) — audit the
  // coupled effective flag, not the independent inputs.
  const dragOrTag = !!(v.drag || v.tag);
  if (dragOrTag && !has("Drag Along")) errors.push("drag|tag=true but 'Drag Along' missing");
  if (!dragOrTag && has("Drag Along")) errors.push("drag|tag=false but 'Drag Along' present");
  if (dragOrTag && !has("Tag Along")) errors.push("drag|tag=true but 'Tag Along' missing");
  if (!dragOrTag && has("Tag Along")) errors.push("drag|tag=false but 'Tag Along' present");

  // ─── Deadlock always present ───────────────────────────────────────────
  const deadlockMarker = isCorp ? "Purchase of Shareholder Interests upon Deadlock" : "Purchasing Member";
  if (!has(deadlockMarker)) errors.push("Deadlock/shotgun MISSING");

  // ─── transfer-to-relatives always present ──────────────────────────────
  if (!has("to an immediate family member")) errors.push("transfer-to-relatives clause MISSING");

  // ─── NC duration ───────────────────────────────────────────────────────
  if (v.nc === "Yes" && !has("TWO (2) years following termination")) {
    errors.push("NC=Yes but 'TWO (2) years following termination' missing");
  }

  // ─── SMD threshold gated on supermaj-used (Antonio 2026-05-26) ─────────
  // Use (75.00%) as the cross-entity indicator — LLC §19.8 is "Super Majority
  // Defined" but Corp §1.7 is just "Super Majority" (no "Defined" word), so a
  // heading-based check would false-positive on Corp.
  const usesSuper = Object.values(vp).includes("Supermayoría");
  if (usesSuper && !has("(75.00%)")) errors.push("supermaj used but '(75.00%)' SMD threshold missing");
  if (!usesSuper && has("(75.00%)")) errors.push("supermaj NOT used but '(75.00%)' SMD threshold present");

  // ─── Leftover tokens / placeholders ────────────────────────────────────
  if (/@VK:/.test(t)) errors.push("leftover @VK token");
  if (/\{\{[a-zA-Z_]+\}\}/.test(t)) errors.push("leftover {{placeholder}}");
  if (/«[^»]+»/.test(t)) errors.push("leftover «placeholder»");

  // ─── Voting-key absence anchors (matrix's 16+ list, adapted for harness profile) ──
  // For each anchor, if the expected voting term for this variant's relevant key is
  // NOT "Majority", the bare "Majority X" anchor must NOT survive (negative-lookbehind
  // for "Super " so "Super Majority X" doesn't false-positive).
  const wordFor = (key) => TERM[vp[key]];
  function absenceCheck(anchor, key, label) {
    if (wordFor(key) === "Majority") return;
    const re = new RegExp(`(?<!Super )${escapeRe(anchor)}`);
    if (re.test(t)) errors.push(`${isCorp ? "Corp" : "LLC"} [${label}] STALE 'Majority' anchor (expected ${wordFor(key)} for ${key}=${v.voting})`);
  }
  if (isCorp) {
    absenceCheck("Majority election to dissolve by the Shareholders", "major", "dissolution");
    absenceCheck("proposed by any Shareholder and approved by a Majority of the Shareholders", "newMember", "new_shareholder");
    absenceCheck("raise additional capital shall be made with the Majority approval of the Shareholders", "capital", "moreCapital");
    absenceCheck("explicit Majority approval of the Board of Directors", "loans", "loans");
    absenceCheck("Majority consent or approval of both the Shareholders and the Board", "sale", "sale-both");
    absenceCheck("Majority consent or approval of the Shareholders and the Board", "sale", "sale");
    absenceCheck("Majority affirmative vote of the Board of Directors", "major", "major-affirm");
    absenceCheck("Majority consent of the Board of Directors", "major", "major-consent");
    absenceCheck("Majority vote of the Shareholders at a meeting", "removal", "officer_removal");
    absenceCheck("Majority approve such new shareholder", "newMember", "new_shareholder §13.8");
    absenceCheck("require the Majority approval of the Shareholders, except that the Personal Representative", "newMember", "new_shareholder §13.8-alt");
    absenceCheck("approved by a Majority of the Shareholders in their sole and absolute discretion", "sale", "sale §3.2.B");
    // §13.1.D typo guard (Corp template missing "of" — fixed in 2ad8a3bb)
    for (const w of ["Majority", "Super Majority", "Unanimous"]) {
      if (has(`${w} the remaining Shareholders`)) errors.push(`Corp §13.1.D template typo: '${w} the remaining Shareholders' (missing 'of')`);
    }
    // §13.2.A LLC-term leak (fixed in 2ad8a3bb)
    if (has("membership interest")) errors.push("Corp doc contains LLC-only term 'membership interest'");
  } else {
    absenceCheck("agreed by Majority to the incurrence", "capital", "additional_capital §5.2");
    absenceCheck("personal loans from any Member of the Company with the Majority consent of the Members", "loans", "loans §6.1");
    absenceCheck("Company's assets requires the Majority consent of the Members", "sale", "sale §8");
    absenceCheck("The Majority Approval of the Members shall be required", "major", "major §11.4.i");
    absenceCheck("shall admit new Members (or transferees of any interests of existing Members) to the Company by the Majority vote or consent", "newMember", "new_member §13.1");
    absenceCheck("unless the Members by Majority agree otherwise", "newMember", "new_member §13.1-alt");
    absenceCheck("Majority vote or consent of all other Members of the Company", "removal", "officer_removal §14.6");
    absenceCheck("Majority election of the Members to dissolve", "dissolution", "dissolution §15.1");
    absenceCheck("Majority vote of the Members excluding", "removal", "officer_removal §11.1.C");
  }

  return errors;
}

(async () => {
  const argIds = process.argv.slice(2).map(Number).filter(x => !isNaN(x));
  const targets = argIds.length
    ? VARIANTS.filter(v => argIds.includes(v.id))
    : VARIANTS;

  let pass = 0, fail = 0, missing = 0;
  const failures = [], missingList = [];
  for (const v of targets) {
    const errs = auditVariant(v);
    if (errs.length === 0) { pass++; continue; }
    if (errs.length === 1 && errs[0].startsWith("DOCX missing")) {
      missing++; missingList.push(v.id);
      continue;
    }
    fail++;
    failures.push({ id: v.id, label: v.label, entity: v.entity, voting: v.voting, errors: errs });
    console.log(`🔴 v${v.id} ${v.label} ${v.entity} ${v.voting} ${v.ownerCount}o (rofr=${+v.rofr} dt=${+v.drag}${+v.tag} nc=${v.nc} ns=${v.ns}):`);
    for (const e of errs) console.log(`     ${e}`);
  }
  console.log("\n" + "=".repeat(60));
  console.log(`Audited ${targets.length}  ·  PASS: ${pass}  ·  FAIL: ${fail}  ·  DOCX missing: ${missing}`);
  if (missing) console.log(`  Missing IDs: ${missingList.slice(0, 30).join(",")}${missingList.length > 30 ? "..." : ""}`);
  const outPath = "/tmp/audit-e2e-docx-results.json";
  fs.writeFileSync(outPath, JSON.stringify({
    audited: targets.length, pass, fail, missing,
    missingIds: missingList,
    failures,
  }, null, 2));
  console.log(`\nFull results: ${outPath}`);
  process.exit(fail > 0 ? 1 : 0);
})();
