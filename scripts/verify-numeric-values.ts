/* Numeric-value rendering sweep.
 *
 * The variant matrix tests TOPOLOGY (entity / owners / voting / toggles) at
 * fixture-default numeric values (supermajorityThreshold=75, nonCompeteDuration
 * defaults to 2). It would miss a "renders the wrong value" regression at
 * non-default inputs. This sweep fixes the topology and varies the numeric
 * values, then asserts the rendered wording matches the input.
 *
 * Threshold ∈ {51, 67, 75, 99}  ×  NC duration ∈ {1, 2, 3, 5}  ×  2 entities
 *   = 32 variants, runs in a few seconds. */
import * as fs from "fs";
import * as zlib from "zlib";
import * as os from "os";
import * as nodePath from "path";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper.js";
import { generateDocument } from "../src/lib/agreement-docgen.js";

const TMPDIR = fs.mkdtempSync(nodePath.join(os.tmpdir(), "vnum-"));
const LLC = JSON.parse(fs.readFileSync("scripts/fixtures/llc-base.payload.json", "utf8"));
const CORP = JSON.parse(fs.readFileSync("scripts/fixtures/corp-base.payload.json", "utf8"));
const NAMES = ["Alpha Uno", "Bravo Dos", "Charlie Tres"];
const PCTS = [50, 30, 20];
const OFF = ["President", "Vice-President", "Secretary"];

const SUPER = "Supermayoría";

function txt(buf: Buffer): string {
  let o = 0; const sig = 0x04034b50;
  while (o < buf.length - 4) { if (buf.readUInt32LE(o) === sig) { const c = buf.readUInt16LE(o + 8), z = buf.readUInt32LE(o + 18), fn = buf.readUInt16LE(o + 26), ex = buf.readUInt16LE(o + 28); const n = buf.toString("utf8", o + 30, o + 30 + fn), ds = o + 30 + fn + ex; if (n === "word/document.xml") { const r = buf.subarray(ds, ds + z); return (c === 8 ? zlib.inflateRawSync(r) : Buffer.from(r)).toString("utf8").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " "); } o = ds + z; } else o++; }
  return "";
}

// Inverse of docgen's numberToWords for the small range we care about. Matches
// the docgen output verbatim (UPPERCASE, hyphenated, no "and").
const WORDS: Record<number, string> = {
  1: "ONE", 2: "TWO", 3: "THREE", 5: "FIVE",
  51: "FIFTY-ONE", 67: "SIXTY-SEVEN", 75: "SEVENTY-FIVE", 99: "NINETY-NINE",
};

type Cfg = { i: number; entity: "LLC" | "Corp"; threshold: number; duration: number };

function build(): Cfg[] {
  const out: Cfg[] = []; let i = 0;
  for (const entity of ["LLC", "Corp"] as const)
    for (const threshold of [51, 67, 75, 99])
      for (const duration of [1, 2, 3, 5])
        out.push({ i: i++, entity, threshold, duration });
  return out;
}

function payload(c: Cfg) {
  const isCorp = c.entity === "Corp";
  const d = JSON.parse(JSON.stringify(isCorp ? CORP : LLC));
  const p = isCorp ? "corp_" : "llc_";
  // 3 owners (template baseline)
  const owners: any = {}; const capKey = isCorp ? "corp_capitalPerOwner_" : "llc_capitalContributions_";
  for (let k = 0; k < 3; k++) { owners[k] = { fullName: NAMES[k], firstName: NAMES[k].split(" ")[0], lastName: NAMES[k].split(" ")[1], ownership: PCTS[k], ownershipPercentage: PCTS[k] }; d.agreement[`${capKey}${k}`] = String(10000 * (k + 1)); }
  for (let k = 3; k < 6; k++) delete d.agreement[`${capKey}${k}`];
  d.owners = owners; d.ownersCount = 3;
  if (isCorp) { d.admin = { ...(d.admin || {}) }; for (let k = 0; k < 3; k++) d.admin[`shareholderOfficer${k + 1}Role`] = OFF[k]; for (let k = 3; k < 6; k++) delete d.admin[`shareholderOfficer${k + 1}Role`]; }
  // major-decisions = supermajority (so threshold is actually used + SMD glossary renders).
  // The other voting keys can stay at whatever the fixture has — major_decisions
  // is what gates supermajorityIsUsed().
  d.agreement[`${p}majorDecisions${isCorp ? "Threshold" : ""}`] = SUPER;
  if (isCorp) d.agreement["corp_majorDecisionThreshold"] = SUPER;
  else d.agreement["llc_majorDecisions"] = SUPER;
  // numeric values under test
  d.agreement.supermajorityThreshold = c.threshold;
  d.agreement[`${p}nonCompeteDuration`] = c.duration;
  // NC must be ON so the duration string actually renders
  d.agreement[`${p}nonCompete`] = "Yes";
  return d;
}

(async () => {
  const sweep = build();
  const TOTAL = sweep.length;
  let fails = 0; const failList: string[] = [];
  for (const c of sweep) {
    const label = `#${c.i} ${c.entity} threshold=${c.threshold} duration=${c.duration}y`;
    const errs: string[] = [];
    try {
      const answers = await mapFormToDocgenAnswers(payload(c));
      const { buffer } = await generateDocument(answers);
      fs.writeFileSync(nodePath.join(TMPDIR, `vn_${c.i}.docx`), buffer);
      const t = txt(buffer);
      // Threshold — both word form ("SEVENTY-FIVE PERCENT") and numeric "(75.00%)".
      const wThresh = WORDS[c.threshold];
      const numericThresh = `(${c.threshold}.00%)`;
      if (!t.includes(numericThresh)) errs.push(`threshold numeric '${numericThresh}' MISSING`);
      if (!t.includes(`${wThresh} PERCENT ${numericThresh}`)) errs.push(`threshold word-form '${wThresh} PERCENT ${numericThresh}' MISSING`);
      // Verify no OTHER thresholds leaked in — only ours.
      for (const other of [51, 67, 75, 99]) if (other !== c.threshold && t.includes(`(${other}.00%)`)) errs.push(`stale threshold '(${other}.00%)' leaked`);
      // Duration — "TWO (2) years following termination".
      const wDur = WORDS[c.duration];
      const durMarker = `${wDur} (${c.duration}) years following termination`;
      if (!t.includes(durMarker)) errs.push(`duration '${durMarker}' MISSING`);
      for (const other of [1, 2, 3, 5]) if (other !== c.duration) { const stale = `${WORDS[other]} (${other}) years following termination`; if (t.includes(stale)) errs.push(`stale duration '${stale}' leaked`); }
    } catch (e) { errs.push("THREW: " + (e as Error).message.slice(0, 100)); }
    if (errs.length) { fails++; failList.push(label + " :: " + errs.join(" | ")); console.log(`🔴 ${label}`); errs.forEach((e) => console.log("     " + e)); }
    else process.stdout.write(`\r✓ ${c.i + 1}/${TOTAL}   `);
  }
  console.log("\n" + "=".repeat(56));
  console.log(fails === 0 ? `✅ ${TOTAL}/${TOTAL} numeric-value variants PASS` : `🔴 ${fails}/${TOTAL} FAILED:\n` + failList.join("\n"));
  process.exit(fails === 0 ? 0 : 1);
})();
