/* Systematic variant matrix through the REAL production transform
 * (mapFormToDocgenAnswers -> generateDocument), each run through the structural
 * auditor + per-variant content assertions.
 *
 * Unlike the bit-pattern spread this fully DECOUPLES the dimensions:
 *   2 entities x 6 owner-counts x 4 voting profiles x 10 toggle-presets = 480.
 * So every entity gets every voting profile at every owner count (the bit
 * pattern coupled LLC -> never supermajority/mixed), and the 10 presets cover
 * each toggle in both states INCLUDING the single-feature configs (NS-only,
 * RoFR-only, DragTag-only, Heirs-only, Divorce-only) — pair-gaps the previous
 * 5-preset set coupled. */
import * as fs from "fs";
import * as zlib from "zlib";
import * as os from "os";
import * as nodePath from "path";

// CI-safe scratch dir (the runner has no /tmp/ulcheck).
const TMPDIR = fs.mkdtempSync(nodePath.join(os.tmpdir(), "vmatrix-"));
import { execSync } from "child_process";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper.js";
import { generateDocument } from "../src/lib/agreement-docgen.js";

const LLC = JSON.parse(fs.readFileSync("scripts/fixtures/llc-base.payload.json", "utf8"));
const CORP = JSON.parse(fs.readFileSync("scripts/fixtures/corp-base.payload.json", "utf8"));
const NAMES = ["Alpha Uno", "Bravo Dos", "Charlie Tres", "Delta Cuatro", "Echo Cinco", "Foxtrot Seis"];
const PCTS: Record<number, number[]> = { 1: [100], 2: [60, 40], 3: [50, 30, 20], 4: [40, 30, 20, 10], 5: [30, 25, 20, 15, 10], 6: [30, 25, 15, 12, 10, 8] };
const OFF = ["President", "Vice-President", "Secretary", "Treasurer", "Assistant Vice-President", "Assistant Secretary"];
const V = { majority: "Mayoría", supermajority: "Supermayoría", unanimous: "Decisión Unánime" } as const;
const VOTING_KEYS_LLC = ["llc_additionalContributionsDecision", "llc_memberLoansVoting", "llc_companySaleDecision", "llc_majorDecisions", "llc_newMembersAdmission", "llc_dissolutionDecision", "llc_officerRemovalVoting"];
const VOTING_KEYS_CORP = ["corp_moreCapitalDecision", "corp_shareholderLoansVoting", "corp_saleDecisionThreshold", "corp_majorDecisionThreshold", "corp_newShareholdersAdmission", "corp_officerRemovalVoting"];
const XFER = { free: "Sí, podrán transferir libremente sus acciones.", unanimous: "Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.", majority: "Sí, podrán transferir si hay mayoría." } as const;

function txt(buf: Buffer): string {
  let o = 0; const sig = 0x04034b50;
  while (o < buf.length - 4) { if (buf.readUInt32LE(o) === sig) { const c = buf.readUInt16LE(o + 8), z = buf.readUInt32LE(o + 18), fn = buf.readUInt16LE(o + 26), ex = buf.readUInt16LE(o + 28); const n = buf.toString("utf8", o + 30, o + 30 + fn), ds = o + 30 + fn + ex; if (n === "word/document.xml") { const r = buf.subarray(ds, ds + z); return (c === 8 ? zlib.inflateRawSync(r) : Buffer.from(r)).toString("utf8").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " "); } o = ds + z; } else o++; }
  return "";
}

type Cfg = { i: number; entity: "LLC" | "Corp"; n: number; voting: keyof typeof V | "mixed"; preset: string; rofr: boolean; dragtag: boolean; nc: boolean; ns: boolean; heirs: boolean; divorce: boolean; xfer: keyof typeof XFER };

// 10 toggle-presets — 5 combinatorial (allOff/allOn/covenants/xferDivorce/
// succession) + 5 single-feature (NS-only / RoFR-only / DT-only / Heirs-only /
// Divorce-only). The single-feature ones close pair-gaps the combinatorial
// presets coupled: NS-without-NC, RoFR-without-DragTag, DragTag-without-RoFR,
// Heirs-alone, Divorce-alone — all real form configs.
const PRESETS = [
  { name: "allOff", rofr: false, dragtag: false, nc: false, ns: false, heirs: false, divorce: false, xfer: "free" as const },
  { name: "allOn", rofr: true, dragtag: true, nc: true, ns: true, heirs: true, divorce: true, xfer: "unanimous" as const },
  { name: "covenants", rofr: false, dragtag: false, nc: true, ns: true, heirs: false, divorce: false, xfer: "majority" as const },
  { name: "xferDivorce", rofr: true, dragtag: true, nc: false, ns: false, heirs: false, divorce: true, xfer: "unanimous" as const },
  { name: "succession", rofr: false, dragtag: false, nc: true, ns: false, heirs: true, divorce: true, xfer: "majority" as const },
  // single-feature (each toggle ON alone) — closes the pair-combo gaps above.
  { name: "NSonly", rofr: false, dragtag: false, nc: false, ns: true, heirs: false, divorce: false, xfer: "free" as const },
  { name: "RoFRonly", rofr: true, dragtag: false, nc: false, ns: false, heirs: false, divorce: false, xfer: "free" as const },
  { name: "DTonly", rofr: false, dragtag: true, nc: false, ns: false, heirs: false, divorce: false, xfer: "free" as const },
  { name: "Heirsonly", rofr: false, dragtag: false, nc: false, ns: false, heirs: true, divorce: false, xfer: "free" as const },
  { name: "Divorceonly", rofr: false, dragtag: false, nc: false, ns: false, heirs: false, divorce: true, xfer: "free" as const },
];
const ENTITIES = ["LLC", "Corp"] as const;
const VOTINGS = ["majority", "supermajority", "unanimous", "mixed"] as const;

function buildMatrix(): Cfg[] {
  const out: Cfg[] = []; let i = 0;
  for (const entity of ENTITIES) for (let n = 1; n <= 6; n++) for (const voting of VOTINGS) for (const pr of PRESETS)
    out.push({ i: i++, entity, n, voting, preset: pr.name, rofr: pr.rofr, dragtag: pr.dragtag, nc: pr.nc, ns: pr.ns, heirs: pr.heirs, divorce: pr.divorce, xfer: pr.xfer });
  return out;
}

function payload(c: Cfg) {
  const isCorp = c.entity === "Corp";
  const d = JSON.parse(JSON.stringify(isCorp ? CORP : LLC));
  const p = isCorp ? "corp_" : "llc_";
  const owners: any = {}; const capKey = isCorp ? "corp_capitalPerOwner_" : "llc_capitalContributions_";
  for (let k = 0; k < c.n; k++) { owners[k] = { fullName: NAMES[k], firstName: NAMES[k].split(" ")[0], lastName: NAMES[k].split(" ")[1], ownership: PCTS[c.n][k], ownershipPercentage: PCTS[c.n][k] }; d.agreement[`${capKey}${k}`] = String(10000 * (k + 1)); }
  for (let k = c.n; k < 6; k++) delete d.agreement[`${capKey}${k}`];
  d.owners = owners; d.ownersCount = c.n;
  if (isCorp) { d.admin = { ...(d.admin || {}) }; for (let k = 0; k < c.n; k++) d.admin[`shareholderOfficer${k + 1}Role`] = OFF[k]; for (let k = c.n; k < 6; k++) delete d.admin[`shareholderOfficer${k + 1}Role`]; }
  // voting
  const vkeys = isCorp ? VOTING_KEYS_CORP : VOTING_KEYS_LLC;
  if (c.voting === "mixed") { const mix = [V.supermajority, V.majority, V.unanimous, V.supermajority, V.unanimous, V.majority, V.supermajority]; vkeys.forEach((k, idx) => (d.agreement[k] = mix[idx % mix.length])); }
  else vkeys.forEach((k) => (d.agreement[k] = V[c.voting as keyof typeof V]));
  // toggles
  d.agreement[`${p}rofr`] = c.rofr ? "Yes" : "No";
  d.agreement[`${p}tagDragRights`] = c.dragtag ? "Yes" : "No";
  d.agreement[`${p}nonCompete`] = c.nc ? "Yes" : "No";
  d.agreement[`${p}nonSolicitation`] = c.ns ? "Yes" : "No";
  d.agreement[`${p}heirsForcedToSell`] = c.heirs ? "Yes" : "No";
  d.agreement[`${p}divorceBuyoutPolicy`] = c.divorce ? "Yes" : "No";
  d.agreement[`${p}transferToRelatives`] = XFER[c.xfer];
  return d;
}

(async () => {
  const matrix = buildMatrix();
  const TOTAL = matrix.length;
  let fails = 0; const failList: string[] = [];
  for (const c of matrix) {
    const i = c.i;
    const label = `#${i} ${c.entity} ${c.n}o ${c.voting} [${c.preset}] rofr=${+c.rofr} dt=${+c.dragtag} nc=${+c.nc} ns=${+c.ns} heirs=${+c.heirs} div=${+c.divorce} xfer=${c.xfer}`;
    const errs: string[] = [];
    let t = "";
    try {
      const answers = await mapFormToDocgenAnswers(payload(c));
      const { buffer } = await generateDocument(answers);
      const path = nodePath.join(TMPDIR, `vm_${i}.docx`); fs.writeFileSync(path, buffer); t = txt(buffer);
      // structural audit
      const a = execSync(`node scripts/audit-corp-structure.mjs ${path} 2>&1`).toString();
      if (!a.includes("CLEAN")) errs.push("AUDIT not clean: " + (a.match(/\d+ issue|first roman[^\n]*|letter sequence[^\n]*|no parent[^\n]*/g) || []).slice(0, 2).join("; "));
    } catch (e) { errs.push("THREW: " + (e as Error).message.slice(0, 80)); failList.push(label + " :: " + errs.join(" | ")); fails++; console.log(`🔴 ${label}`); for (const e2 of errs) console.log("     " + e2); continue; }
    // content assertions
    const has = (s: string) => t.includes(s);
    if (/@VK:/.test(t)) errs.push("leftover @VK token");
    NAMES.slice(0, c.n).forEach((nm) => { if (!has(nm)) errs.push(`owner missing: ${nm}`); });
    // Per-owner capital contribution renders ($10,000.00 / $20,000.00 / …) in
    // §4.2; catches "table broken" / "$0 rendered" / "owner-k amount missing".
    // Leak detect: amounts beyond owner-n must NOT appear (catches "all 6
    // template rows leaked through" when ownersCount<6).
    for (let k = 0; k < c.n; k++) { const amt = `$${(10000 * (k + 1)).toLocaleString("en-US")}.00`; if (!has(amt)) errs.push(`capital amount ${amt} for owner ${k + 1} MISSING`); }
    for (let k = c.n; k < 6; k++) { const amt = `$${(10000 * (k + 1)).toLocaleString("en-US")}.00`; if (has(amt)) errs.push(`stale capital amount ${amt} leaked (n=${c.n})`); }
    const ncTerm = c.entity === "LLC" ? "Non-competition" : "Covenant Against Competition";
    if (c.nc !== has(ncTerm)) errs.push(`NC presence wrong (want ${c.nc})`);
    if (c.ns !== has("Non-Solicitation")) errs.push(`NS presence wrong (want ${c.ns})`);
    if (c.rofr !== has("Right of First Refusal")) errs.push(`RoFR presence wrong (want ${c.rofr})`);
    if (c.dragtag !== has("Drag Along")) errs.push(`Drag presence wrong (want ${c.dragtag})`);
    if (c.dragtag !== has("Tag Along")) errs.push(`Tag presence wrong (want ${c.dragtag})`);
    // Deadlock always present
    const deadlock = c.entity === "LLC" ? "Purchasing Member" : "Purchase of Shareholder Interests upon Deadlock";
    if (!has(deadlock)) errs.push("Deadlock/shotgun MISSING");
    // heirs forced vs option
    if (c.heirs) { if (!has("required to sell the interest")) errs.push("heirs=forced but no 'required to sell'"); }
    else { if (!has("option to retain the interest")) errs.push("heirs=not-forced but no 'option to retain'"); }
    // divorce machinery
    const divHas = c.entity === "LLC" ? has("dissolution of marriage or legal separation of a Member") : has("Divorcing Shareholder");
    if (c.divorce !== divHas) errs.push(`divorce presence wrong (want ${c.divorce})`);
    // transfer-to-relatives clause present (always added; wording varies by mode)
    if (!has("to an immediate family member")) errs.push("transfer-to-relatives clause MISSING");
    // Per-mode xfer wording — content-rendering fidelity, not just presence:
    if (c.xfer === "free" && !has("free of any right of first refusal or other transfer restriction")) errs.push("xfer=free but free-wording missing");
    if (c.xfer === "unanimous" && !has("Unanimous vote or consent of the other")) errs.push("xfer=unanimous but unanimous-wording missing");
    if (c.xfer === "majority" && !has("holding a Majority of the")) errs.push("xfer=majority but majority-wording missing");
    // unanimous => no Super Majority Defined glossary
    if (c.voting === "unanimous" && /Super Majority Defined/.test(t)) errs.push("unanimous but Super Majority Defined present");
    // Supermajority threshold % renders when supermajority is actually used
    // (voting=supermajority always; voting=mixed has supermajority in the rotation).
    // The fixture default is 75 -> "(75.00%)" in the SMD glossary entry.
    const supUsed = c.voting === "supermajority" || c.voting === "mixed";
    if (supUsed && !has("(75.00%)")) errs.push("supermajority used but '(75.00%)' threshold missing");
    if (!supUsed && has("(75.00%)")) errs.push("supermajority NOT used but '(75.00%)' threshold present");
    // NC duration renders ("TWO (2) years following termination") — fixture has
    // no nonCompeteDuration override so it falls back to the docgen default of 2.
    if (c.nc && !has("TWO (2) years following termination")) errs.push("NC=on but 'TWO (2) years following termination' missing");
    // Per-voting-key rendered-word assertions. One per entry in
    // apply{LLC,Corp}VotingReplacements — catches the §14.6-class bug
    // (no-op replacement, missing/typo'd find string, accidental ordering
    // change) at CI time instead of UAT time.
    //
    // The matrix's mixed mix is [SUPERMAJ, MAJ, UNAN, SUPERMAJ, UNAN, MAJ,
    // SUPERMAJ] indexed by VOTING_KEYS_LLC order; Corp uses the same array
    // mod its 6-key length. Corp dissolution follows Corp major per mapper.
    const TERM = { majority: "Majority", supermajority: "Super Majority", unanimous: "Unanimous" } as const;
    const mixMap = ["supermajority", "majority", "unanimous", "supermajority", "unanimous", "majority", "supermajority"] as const;
    const wordFor = (keyIdx: number): string => {
      if (c.voting === "mixed") return TERM[mixMap[keyIdx % mixMap.length]];
      return TERM[c.voting as keyof typeof TERM];
    };
    // For each apply{LLC,Corp}VotingReplacements entry, ABSENCE-check the
    // original "Majority X" anchor when the variant's expected word for that
    // key is NOT "Majority". If the anchor survives, either the targeted
    // entry is a no-op (the §14.6 bug class) AND the global major-decisions
    // sweep didn't catch it (i.e. mixed-voting with major=Majority but this
    // key=Supermaj/Unanimous). Doesn't depend on knowing post-replacement
    // grammar (which differs per term — "a Majority X" vs "Unanimous consent
    // of X" etc.). The 4 visible-text assertions above lock in the specific
    // grammatical forms; this layer just enforces "the bare 'Majority X'
    // anchor is removed when the key isn't Majority".
    // LLC key indexes (per VOTING_KEYS_LLC order):
    //   0=additional_capital  1=loans  2=sale  3=major  4=new_member
    //   5=dissolution  6=officer_removal
    // Corp uses 6 keys (no separate dissolution; dissolution = major per mapper):
    //   0=moreCapital  1=loans  2=sale  3=major  4=newShareholders  5=officerRemoval
    const llcAnchors: Array<[string, number, string]> = [
      ["agreed by Majority to the incurrence", 0, "additional_capital §5.2"],
      ["personal loans from any Member of the Company with the Majority consent of the Members", 1, "loans §6.1"],
      ["Company's assets requires the Majority consent of the Members", 2, "sale §8"],
      ["The Majority Approval of the Members shall be required", 3, "major §11.4.i"],
      ["shall admit new Members (or transferees of any interests of existing Members) to the Company by the Majority vote or consent", 4, "new_member §13.1"],
      ["unless the Members by Majority agree otherwise", 4, "new_member §13.1-alt"],
      ["Majority vote or consent of all other Members of the Company", 6, "officer_removal §14.6"],
      ["Majority election of the Members to dissolve", 5, "dissolution §15.1"],
      ["Majority vote of the Members excluding", 6, "officer_removal §11.1.C"],
    ];
    const corpAnchors: Array<[string, number, string]> = [
      ["Majority election to dissolve by the Shareholders", 3, "dissolution"],
      ["proposed by any Shareholder and approved by a Majority of the Shareholders", 4, "new_shareholder"],
      ["raise additional capital shall be made with the Majority approval of the Shareholders", 0, "moreCapital"],
      ["explicit Majority approval of the Board of Directors", 1, "loans"],
      ["Majority affirmative vote of the Board of Directors", 3, "major affirmative"],
      ["Majority consent of the Board of Directors", 3, "major consent"],
      ["Majority vote of the Shareholders at a meeting", 5, "officer_removal"],
      // §13.8 — new-shareholder admission anchors (PFX23 UAT 2026-05-30). Key
      // idx=4 (new_shareholders_admission). Both anchors approve admitting a
      // new shareholder post-failure-to-purchase + future attempted transfers.
      ["Majority approve such new shareholder", 4, "new_shareholder §13.8"],
      ["require the Majority approval of the Shareholders, except that the Personal Representative", 4, "new_shareholder §13.8-alt"],
      // §3.2.B sale-of-assets dissolution event — should use sale_of_company,
      // not the major-decisions global sweep (matches LLC §8 semantics).
      // Key idx=2 (sale_of_company). Surfaced 2026-05-30 during PFX23/PFX69 UAT.
      ["approved by a Majority of the Shareholders in their sole and absolute discretion", 2, "sale §3.2.B"],
    ];
    // Corp-specific template-typo guards (surfaced PFX21 UAT 2026-05-30):
    //   (a) §13.1.D template originally had "a Majority the remaining
    //       Shareholders" (missing "of"). Sweep propagated it as "a Super
    //       Majority the remaining" / "a Unanimous the remaining". Fixed in
    //       generateCorp; assert here so a regression in the find-string is
    //       caught immediately. Check across all 3 voting words.
    //   (b) §13.2.A template used LLC term "membership interest" in a Corp
    //       doc (entity-term leak — same class as the LLC "his Shares" bug).
    //       Corp must never contain the LLC-only term "membership interest".
    if (c.entity === "Corp") {
      for (const w of ["Majority", "Super Majority", "Unanimous"]) {
        if (has(`${w} the remaining Shareholders`)) errs.push(`Corp §13.1.D template typo: '${w} the remaining Shareholders' (missing 'of')`);
      }
      if (has("membership interest")) errs.push("Corp doc contains LLC-only term 'membership interest'");
    }

    // LLC §14.4 Successor's-Interest buyout discretion is a FIXED majority — no
    // questionnaire field governs the successor-buyout threshold, so it must
    // ALWAYS read "a Majority of the remaining Members" regardless of
    // major_decisions. The major-decisions sweep used to clobber it (the §19.7
    // glossary guard only matched "Majority of the Managers/Members", missing
    // "Majority of the *remaining* Members"), so a unanimous/supermajority major
    // profile rendered "Unanimous consent of the remaining Members" /
    // "a Super Majority of the remaining Members". Surfaced 2026-06-23 (SPICE
    // TWENTY FIVE review). The divorce-buyout sentence ("exercise this option…")
    // is a SEPARATE clause and intentionally unanimous — anchor on "interest
    // shall be within the discretion of" so this guard only checks the successor
    // sentence, not the divorce one.
    if (c.entity === "LLC") {
      if (!has("interest shall be within the discretion of a Majority of the remaining Members"))
        errs.push("LLC §14.4 successor-buyout discretion missing fixed 'a Majority of the remaining Members'");
      for (const bad of [
        "interest shall be within the discretion of a Super Majority",
        "interest shall be within the discretion of Unanimous",
        "interest shall be within the discretion of the Unanimous",
      ]) {
        if (has(bad)) errs.push(`LLC §14.4 successor-buyout threshold wrongly swept: '${bad}…' (must stay Majority)`);
      }
    }

    const anchors = c.entity === "LLC" ? llcAnchors : corpAnchors;
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [anchor, idx, label] of anchors) {
      if (wordFor(idx) === "Majority") continue; // No replacement expected.
      // Negative-lookbehind for "Super " — the "Super Majority X" form contains
      // bare "Majority X" as a substring, but it's NOT a stale anchor (it's the
      // post-replacement form). Match only bare "Majority X" not prefixed by Super.
      const re = new RegExp(`(?<!Super )${escapeRe(anchor)}`);
      if (re.test(t)) {
        errs.push(`${c.entity} voting [${label}] STALE 'Majority' anchor (expected ${wordFor(idx)} for variant voting=${c.voting})`);
      }
    }
    if (errs.length) { fails++; failList.push(label + " :: " + errs.join(" | ")); console.log(`🔴 ${label}`); errs.forEach((e) => console.log("     " + e)); }
    else process.stdout.write(`\r✓ ${i + 1}/${TOTAL}   `);
  }
  console.log("\n" + "=".repeat(56));
  console.log(fails === 0 ? `✅ ${TOTAL}/${TOTAL} variants PASS (structure + content)` : `🔴 ${fails}/${TOTAL} FAILED:\n` + failList.join("\n"));
  process.exit(fails === 0 ? 0 : 1);
})();
