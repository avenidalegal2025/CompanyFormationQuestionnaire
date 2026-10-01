// Generates the 20-document visual-review set (one per preset per entity;
// owner counts and voting profiles rotate) for scripts/qa/word-online-pages.mjs.
// Usage: npx tsx scripts/qa/visual-set.ts <outDir>
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

import { execSync } from "child_process";
import { mapFormToDocgenAnswers } from "../../src/lib/agreement-mapper.js";
import { generateDocument } from "../../src/lib/agreement-docgen.js";

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
  // The fixture's tax partner is not one of these owners; the form only offers owners.
  d.agreement[isCorp ? "corp_taxOwner" : "llc_taxPartner"] = NAMES[0];
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


const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  let j = 0;
  for (const entity of ENTITIES) for (let k = 0; k < PRESETS.length; k++) {
    const pr = PRESETS[k]; const n = (k % 6) + 1;
    const voting = VOTINGS[(k + (entity === "Corp" ? 2 : 0)) % VOTINGS.length];
    const c: Cfg = { i: j, entity, n, voting, preset: pr.name, rofr: pr.rofr, dragtag: pr.dragtag, nc: pr.nc, ns: pr.ns, heirs: pr.heirs, divorce: pr.divorce, xfer: pr.xfer };
    const id = `${String(j + 1).padStart(2, "0")}_${entity}_${n}owners_${voting}_${pr.name}`;
    const { buffer } = await generateDocument(await mapFormToDocgenAnswers(payload(c)));
    fs.writeFileSync(nodePath.join(OUT, id + ".docx"), buffer); j++;
  }
})();
