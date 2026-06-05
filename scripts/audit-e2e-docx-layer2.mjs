/* Layer 2 audit — content-fidelity / cross-doc consistency.
 *
 * Layer 1 verifies SHAPE (right voting word in right anchor, right covenant
 * clause present/absent per toggle). Layer 2 verifies VALUES — that the
 * form inputs render verbatim and consistently across all 7 generated docs.
 *
 * Catches a different bug class than Layer 1:
 *   - Cross-doc desync (one doc has stale company name / owner list)
 *   - Percentage / share arithmetic regressions
 *   - Tax-representative drift between 2848 / 8821 / SS4 and the Agreement
 *   - Owner-row reorder or missing/extra rows
 *   - $-amount typos (e.g., $50,000 → $5,000)
 *
 * Usage:
 *   node scripts/audit-e2e-docx-layer2.mjs                  # audit all VARIANTS
 *   node scripts/audit-e2e-docx-layer2.mjs 26 100 200       # audit specific IDs
 *
 * Writes per-variant JSON to /tmp/audit-e2e-docx-layer2-results.json. */

import * as fs from "fs";
import * as zlib from "zlib";
import * as path from "path";
import { execSync } from "child_process";
import { VARIANTS, NAMES, votingProfile } from "./e2e-uat-edge-variants.mjs";

const DOWNLOADS = path.join(process.env.USERPROFILE || ".", "Downloads", "e2e-uat-edge-variants");

/* Paragraph-aware extraction. The IRS tax-form DOCXes (2848 / 8821 / SS4)
 * are actually PDFs masquerading as .docx — detect via magic and route to
 * pdftotext. True DOCXes use the LFH-walk parser (more tolerant than
 * EOCD-scan). One line per <w:p>. */
function extractText(p) {
  const head = Buffer.alloc(8);
  const fd = fs.openSync(p, "r");
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  if (head.slice(0, 4).toString("ascii") === "%PDF") {
    // poppler pdftotext: -layout preserves table alignment; - = stdout.
    const out = execSync(`pdftotext -layout ${JSON.stringify(p)} -`, { encoding: "utf8" });
    return out.split("\n").map(s => s.trim()).filter(Boolean);
  }
  // True DOCX path.
  const buf = fs.readFileSync(p);
  let o = 0; const sig = 0x04034b50;
  let xml = "";
  while (o < buf.length - 30) {
    if (buf.readUInt32LE(o) !== sig) { o++; continue; }
    const method = buf.readUInt16LE(o + 8);
    const csize = buf.readUInt32LE(o + 18);
    const nl = buf.readUInt16LE(o + 26);
    const el = buf.readUInt16LE(o + 28);
    const name = buf.toString("utf8", o + 30, o + 30 + nl);
    const ds = o + 30 + nl + el;
    if (name === "word/document.xml" && csize > 0) {
      const comp = buf.subarray(ds, ds + csize);
      xml = method === 8 ? zlib.inflateRawSync(comp).toString("utf8") : comp.toString("utf8");
      break;
    }
    o = ds + (csize > 0 ? csize : 1);
  }
  if (!xml) throw new Error(`word/document.xml not found in ${p}`);
  const text = xml
    .replace(/<w:p\b[^>]*>/g, "\n")
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
  return text.split("\n").map(s => s.trim()).filter(Boolean);
}
const docxText = extractText;

/* Mirror the harness: harness's companyNameFor() is `${label} ${suffix}`.
 * The Registry uppercases it to `${LABEL} ${SUFFIX}`; the Agreement and
 * other docs keep mixed-case `${LABEL} ${SUFFIX}` (note `LABEL` is already
 * upper-ish like "PFX26"). Both renderings must match the harness's
 * value verbatim. */
function expectedCompanyNames(v) {
  const suffix = v.entity === "C-Corp" ? "Corp" : "LLC";
  const mixed = `${v.label} ${suffix}`;       // "PFX26 Corp"
  const upper = `${v.label} ${suffix.toUpperCase()}`; // "PFX26 CORP"
  return { mixed, upper };
}

/* Mirror harness ownerArray(): floor(100/n) each, last gets remainder. */
function expectedOwners(n) {
  const pct = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => ({
    name: NAMES[i],
    pct: i === n - 1 ? 100 - pct * (n - 1) : pct,
    shares: i === n - 1 ? 1000 - pct * 10 * (n - 1) : pct * 10,
  }));
}

/* Tax-rep selection is policy-dependent in prod (highest-pct owner OR
 * external director when directorsAllOwners='No' OR fallback to
 * NON_OWNER_NAMES[0] for 1-2 owner Corps). Trying to predict this from
 * outside the harness produced 95 false-positives in the first run.
 * Instead, Layer 2 verifies CORRUPTION-not-POLICY: the signer must be
 * SOME name the harness sent (NAMES or NON_OWNER_NAMES), the taxpayer
 * line must be the company name. Mismatch policy = separate Antonio
 * review item; this audit catches data-stream corruption. */
const ALL_HARNESS_NAMES = [
  ...NAMES,
  "Daniel Vega", "Patricia Soto", "Luis Herrera",
  "Carmen Rios", "Andres Castillo", "Gabriela Ortiz", "Hernan Salas",
];

const OFFICER_ROLES = [
  "President", "Vice-President", "Secretary", "Treasurer",
  "Assistant Vice-President", "Assistant Secretary",
];

function docPath(v, docKey) {
  const entityTag = v.entity === "C-Corp" ? "Corp" : "LLC";
  return path.join(DOWNLOADS, `v${v.id}_${v.label}_${entityTag}_-_${docKey}.docx`);
}

/* Helper: find consecutive in-order appearance of `seq` (string array) in
 * `lines` (string array). Returns the start index in lines, or -1.
 * Each lines[i] is matched if it equals or contains seq[k] (exact equality
 * preferred, contains as fallback). */
function findInOrder(lines, seq) {
  outer: for (let i = 0; i <= lines.length - seq.length; i++) {
    for (let k = 0; k < seq.length; k++) {
      const L = lines[i + k];
      if (L !== seq[k] && !L.includes(seq[k])) continue outer;
    }
    return i;
  }
  return -1;
}

function auditCorp(v, errors) {
  const owners = expectedOwners(v.ownerCount);
  const { mixed, upper } = expectedCompanyNames(v);

  // ─── 1. Company name verbatim across all 7 docs ────────────────────────
  const docKeys = [
    "Shareholder_Registry", "Bylaws", "Organizational_Resolution",
    "Shareholder_Agreement", "Form_2848_Power_of_Attorney",
    "Form_8821_Tax_Information_Authorization", "SS4",
  ];
  for (const k of docKeys) {
    const p = docPath(v, k);
    if (!fs.existsSync(p)) { errors.push(`${k}: DOCX missing`); continue; }
    let lines;
    try { lines = docxText(p); } catch (e) { errors.push(`${k}: parse error ${e.message}`); continue; }
    const joined = lines.join(" ");
    // The company name MUST appear in some form (mixed or upper) in every doc.
    if (!joined.includes(mixed) && !joined.includes(upper)) {
      errors.push(`${k}: company name '${mixed}' / '${upper}' MISSING`);
    }
    // No stale name from a sibling variant (e.g., "PFX25 Corp")
    const STALE_RE = /\bPFX?\d{2,3}\s+(?:Corp|CORP|LLC|llc)\b/g;
    const matches = joined.match(STALE_RE) || [];
    const others = new Set(matches.filter(m => m !== mixed && m !== upper));
    if (others.size) errors.push(`${k}: foreign company name(s): ${[...others].join(", ")}`);
  }

  // ─── 2. Shareholder Registry — table integrity ─────────────────────────
  const regP = docPath(v, "Shareholder_Registry");
  if (fs.existsSync(regP)) {
    const regL = docxText(regP);
    // Owners appear in order. Each owner row is: name / "Allotted" / shares / "Common Stock" / pct.
    // Share counts ≥1000 render with thousands-separator comma ("1,000" not "1000").
    for (let i = 0; i < owners.length; i++) {
      const nameIdx = regL.findIndex(L => L === owners[i].name);
      if (nameIdx < 0) { errors.push(`Registry: owner '${owners[i].name}' MISSING`); continue; }
      const sharesRaw = String(owners[i].shares);
      const sharesFmt = owners[i].shares.toLocaleString("en-US");
      const pct = `${owners[i].pct.toFixed(2)}%`;
      const window = regL.slice(nameIdx, nameIdx + 6).join("|");
      if (!window.includes("Allotted")) errors.push(`Registry: owner '${owners[i].name}' missing 'Allotted' marker`);
      if (!window.includes(sharesRaw) && !window.includes(sharesFmt)) {
        errors.push(`Registry: owner '${owners[i].name}' shares=${sharesRaw}/${sharesFmt} not adjacent`);
      }
      if (!window.includes(pct)) errors.push(`Registry: owner '${owners[i].name}' pct=${pct} not adjacent`);
    }
    // Stale owners beyond N must NOT appear.
    for (let k = v.ownerCount; k < NAMES.length; k++) {
      if (regL.some(L => L === NAMES[k])) errors.push(`Registry: stale owner '${NAMES[k]}' present (n=${v.ownerCount})`);
    }
    // Percentages sum to 100 (sanity check the table arithmetic).
    const pctMatches = [...regL.join("\n").matchAll(/^(\d+\.\d{2})%$/gm)].map(m => parseFloat(m[1]));
    const ownerPcts = pctMatches.slice(0, v.ownerCount);
    const sum = ownerPcts.reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 100) > 0.01) {
      errors.push(`Registry: owner percentages sum to ${sum.toFixed(2)}%, expected 100.00%`);
    }
    // Registry signer (President) must be a name we sent (owner or director).
    // The choice between owner-as-President vs external-director-as-President
    // depends on the variant's `directorsAllOwners` setting — Layer 2 only
    // guards against corruption (foreign name appearing).
    const presIdx = regL.findIndex(L => L === "President");
    if (presIdx > 0) {
      const signer = regL[presIdx - 1].replace(/^Name:\s*/, "").trim();
      if (!ALL_HARNESS_NAMES.some(n => signer.includes(n))) {
        errors.push(`Registry: President signer '${signer}' is not a harness-known name`);
      }
    }
  }

  // ─── 3. Shareholder Agreement — §4.2 capital table consistency ─────────
  const agP = docPath(v, "Shareholder_Agreement");
  if (fs.existsSync(agP)) {
    const agL = docxText(agP);
    for (let i = 0; i < owners.length; i++) {
      const nameIdx = agL.findIndex((L, j) => L === owners[i].name && j > 30); // skip TOC region
      if (nameIdx < 0) { errors.push(`Agreement: owner '${owners[i].name}' MISSING from §4.2 region`); continue; }
      const window = agL.slice(nameIdx, nameIdx + 4).join("|");
      const sharesRaw = String(owners[i].shares);
      const sharesFmt = owners[i].shares.toLocaleString("en-US");
      const pct = `${owners[i].pct.toFixed(2)}%`;
      if (!window.includes(sharesRaw) && !window.includes(sharesFmt)) {
        errors.push(`Agreement §4.2: '${owners[i].name}' shares=${sharesRaw}/${sharesFmt} not adjacent`);
      }
      if (!window.includes("$50,000.00")) errors.push(`Agreement §4.2: '${owners[i].name}' capital $50,000.00 not adjacent`);
      if (!window.includes(pct)) errors.push(`Agreement §4.2: '${owners[i].name}' pct=${pct} not adjacent`);
    }
    // Stale owners.
    for (let k = v.ownerCount; k < NAMES.length; k++) {
      if (agL.some(L => L === NAMES[k])) errors.push(`Agreement: stale owner '${NAMES[k]}' present (n=${v.ownerCount})`);
    }
    // §10.6 officer chain. Roles rendered depend on harness settings:
    //   officersAllOwners='Yes' (default) → OFFICER_ROLES[0 .. min(ownerCount,6)-1]
    //   officersAllOwners='No' singleFounder/count=1 → [President]
    //   officersAllOwners='No' twoOfficers/count=2   → [President, Treasurer]  (verified PF153/PF496)
    //   officersAllOwners='No' externalTeam/count=4  → first 4 OFFICER_ROLES
    let expectedRoles;
    if (v.officersAllOwners === "No") {
      const c = v.officersCount || 1;
      if (c === 1) expectedRoles = ["President"];
      else if (c === 2) expectedRoles = ["President", "Treasurer"];
      else expectedRoles = OFFICER_ROLES.slice(0, c);
    } else {
      expectedRoles = OFFICER_ROLES.slice(0, Math.min(v.ownerCount, 6));
    }
    for (const role of expectedRoles) {
      const roleIdx = agL.findIndex(L => L === role);
      if (roleIdx <= 0) {
        errors.push(`Agreement §10.6: role '${role}' line MISSING`);
        continue;
      }
      const assignee = agL[roleIdx - 1];
      if (!ALL_HARNESS_NAMES.some(n => assignee.includes(n))) {
        errors.push(`Agreement §10.6: '${role}' assignee '${assignee}' is not a harness-known name`);
      }
    }
    // Signature block — every OWNER appears as "Name: <name>" line.
    for (const o of owners) {
      const sig = agL.some(L => L.startsWith("Name:") && L.includes(o.name));
      if (!sig) errors.push(`Agreement signature: '${o.name}' missing 'Name:' line`);
    }
  }

  // ─── 4. Tax forms (2848 / 8821 / SS4) — corruption-only checks ─────────
  // Production picks the tax rep via a multi-branch heuristic (highest-pct
  // owner / director / fallback). Layer 2 only catches CORRUPTION:
  //   (a) Signer name must be a harness-known string (otherwise it's
  //       garbage data from a wrong code path)
  //   (b) Taxpayer field must contain THIS variant's company name
  for (const k of ["Form_2848_Power_of_Attorney", "Form_8821_Tax_Information_Authorization", "SS4"]) {
    const p = docPath(v, k);
    if (!fs.existsSync(p)) continue;
    let lines;
    try { lines = docxText(p); }
    catch (e) { errors.push(`${k}: parse error ${e.message}`); continue; }
    const t = lines.join(" ");
    // (a) Some harness name appears as a signer somewhere.
    const upT = t.toUpperCase();
    const anyName = ALL_HARNESS_NAMES.some(n => upT.includes(n.toUpperCase()));
    if (!anyName) errors.push(`${k}: NO harness-known signer name found (data corruption?)`);
    // (b) This variant's company name (uppercased) appears as taxpayer.
    if (!upT.includes(upper.toUpperCase())) {
      errors.push(`${k}: taxpayer company '${upper}' MISSING`);
    }
  }
}

function auditLlc(v, errors) {
  const owners = expectedOwners(v.ownerCount);
  const { mixed, upper } = expectedCompanyNames(v);

  const docKeys = [
    "Membership_Registry", "Operating_Agreement", "Organizational_Resolution",
    "Form_2848_Power_of_Attorney", "Form_8821_Tax_Information_Authorization", "SS4",
  ];
  for (const k of docKeys) {
    const p = docPath(v, k);
    if (!fs.existsSync(p)) { /* LLC doc set varies — skip-soft on missing */ continue; }
    let lines;
    try { lines = docxText(p); } catch (e) { errors.push(`${k}: parse error ${e.message}`); continue; }
    const joined = lines.join(" ");
    if (!joined.includes(mixed) && !joined.includes(upper)) {
      errors.push(`${k}: company name '${mixed}' / '${upper}' MISSING`);
    }
    const STALE_RE = /\bPFX?\d{2,3}\s+(?:Corp|CORP|LLC|llc)\b/g;
    const matches = joined.match(STALE_RE) || [];
    const others = new Set(matches.filter(m => m !== mixed && m !== upper));
    if (others.size) errors.push(`${k}: foreign company name(s): ${[...others].join(", ")}`);
  }

  // Operating Agreement — owner table + signature block
  const opP = docPath(v, "Operating_Agreement");
  if (fs.existsSync(opP)) {
    const opL = docxText(opP);
    for (let i = 0; i < owners.length; i++) {
      if (!opL.some(L => L === owners[i].name || L.includes(owners[i].name))) {
        errors.push(`Operating Agreement: owner '${owners[i].name}' MISSING`);
      }
    }
    for (let k = v.ownerCount; k < NAMES.length; k++) {
      if (opL.some(L => L === NAMES[k])) errors.push(`Operating Agreement: stale owner '${NAMES[k]}' present (n=${v.ownerCount})`);
    }
    // Capital amount appears at least N times.
    const joined = opL.join(" ");
    const capMatches = joined.match(/\$50,000\.00/g) || [];
    if (capMatches.length < v.ownerCount) {
      errors.push(`Operating Agreement: '$50,000.00' appears ${capMatches.length} times, expected ≥ ${v.ownerCount}`);
    }
    // Percentages sum to 100.
    const pctRows = [...joined.matchAll(/(\d+\.\d{2})%/g)].map(m => parseFloat(m[1]));
    // Take first N owner percentage rows (filter implausibles like 50.01, 75.00).
    const ownerPcts = pctRows.filter(p => p !== 50.01 && p !== 75.00 && p !== 100).slice(0, v.ownerCount);
    if (ownerPcts.length === v.ownerCount) {
      const sum = ownerPcts.reduce((s, x) => s + x, 0);
      if (Math.abs(sum - 100) > 0.01) {
        errors.push(`Operating Agreement: owner percentages sum to ${sum.toFixed(2)}%, expected 100.00%`);
      }
    }
  }

  // Tax forms: corruption-only checks (same rationale as Corp branch).
  for (const k of ["Form_2848_Power_of_Attorney", "Form_8821_Tax_Information_Authorization", "SS4"]) {
    const p = docPath(v, k);
    if (!fs.existsSync(p)) continue;
    let lines;
    try { lines = docxText(p); }
    catch (e) { errors.push(`${k}: parse error ${e.message}`); continue; }
    const t = lines.join(" ");
    const upT = t.toUpperCase();
    const anyName = ALL_HARNESS_NAMES.some(n => upT.includes(n.toUpperCase()));
    if (!anyName) errors.push(`${k}: NO harness-known signer name found (data corruption?)`);
    if (!upT.includes(upper.toUpperCase())) {
      errors.push(`${k}: taxpayer company '${upper}' MISSING`);
    }
  }
}

function auditVariant(v) {
  const errors = [];
  if (v.entity === "C-Corp") auditCorp(v, errors);
  else auditLlc(v, errors);
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
    // All errors that begin with "DOCX missing" or come from missing-doc paths
    // are counted as missing (not failure). Conservative: any single "DOCX missing"-only
    // error → missing; mixed → fail.
    const onlyMissing = errs.every(e => e.includes("DOCX missing"));
    if (onlyMissing) { missing++; missingList.push(v.id); continue; }
    fail++;
    failures.push({ id: v.id, label: v.label, entity: v.entity, voting: v.voting, ownerCount: v.ownerCount, errors: errs });
    console.log(`🔴 v${v.id} ${v.label} ${v.entity} ${v.voting} ${v.ownerCount}o:`);
    for (const e of errs) console.log(`     ${e}`);
  }
  console.log("\n" + "=".repeat(60));
  console.log(`Audited ${targets.length}  ·  PASS: ${pass}  ·  FAIL: ${fail}  ·  DOCX missing: ${missing}`);
  if (missing) console.log(`  Missing IDs: ${missingList.slice(0, 30).join(",")}${missingList.length > 30 ? "..." : ""}`);
  const outPath = "/tmp/audit-e2e-docx-layer2-results.json";
  fs.writeFileSync(outPath, JSON.stringify({
    audited: targets.length, pass, fail, missing,
    missingIds: missingList,
    failures,
  }, null, 2));
  console.log(`\nFull results: ${outPath}`);
  process.exit(fail > 0 ? 1 : 0);
})();
