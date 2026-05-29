/* 100-variant content+structure verification through the REAL production
 * transform (mapFormToDocgenAnswers -> generateDocument), each run through the
 * structural auditor + per-variant content assertions. Deterministic spread
 * across entity / owner-count / voting profile / every toggle. */
import * as fs from "fs";
import * as zlib from "zlib";
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

type Cfg = { i: number; entity: "LLC" | "Corp"; n: number; voting: keyof typeof V | "mixed"; rofr: boolean; dragtag: boolean; nc: boolean; ns: boolean; heirs: boolean; divorce: boolean; xfer: keyof typeof XFER };

function buildCfg(i: number): Cfg {
  const entity = i % 2 === 0 ? "LLC" : "Corp";
  const n = (i % 6) + 1;
  const voting = (["majority", "supermajority", "unanimous", "mixed"] as const)[i % 4];
  return { i, entity, n, voting, rofr: !!((i >> 1) & 1), dragtag: !!((i >> 2) & 1), nc: !!((i >> 3) & 1), ns: !!((i >> 4) & 1), heirs: !!((i >> 5) & 1), divorce: !!((i >> 6) & 1), xfer: (["free", "unanimous", "majority"] as const)[i % 3] };
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
  let fails = 0; const failList: string[] = [];
  for (let i = 0; i < 100; i++) {
    const c = buildCfg(i);
    const label = `#${i} ${c.entity} ${c.n}o ${c.voting} rofr=${+c.rofr} dt=${+c.dragtag} nc=${+c.nc} ns=${+c.ns} heirs=${+c.heirs} div=${+c.divorce}`;
    const errs: string[] = [];
    let t = "";
    try {
      const answers = await mapFormToDocgenAnswers(payload(c));
      const { buffer } = await generateDocument(answers);
      const path = `/tmp/ulcheck/v100_${i}.docx`; fs.writeFileSync(path, buffer); t = txt(buffer);
      // structural audit
      const a = execSync(`node scripts/audit-corp-structure.mjs ${path} 2>&1`).toString();
      if (!a.includes("CLEAN")) errs.push("AUDIT not clean: " + (a.match(/\d+ issue|first roman[^\n]*|letter sequence[^\n]*|no parent[^\n]*/g) || []).slice(0, 2).join("; "));
    } catch (e) { errs.push("THREW: " + (e as Error).message.slice(0, 80)); failList.push(label + " :: " + errs.join(" | ")); fails++; console.log(`🔴 ${label}`); for (const e2 of errs) console.log("     " + e2); continue; }
    // content assertions
    const has = (s: string) => t.includes(s);
    if (/@VK:/.test(t)) errs.push("leftover @VK token");
    NAMES.slice(0, c.n).forEach((nm) => { if (!has(nm)) errs.push(`owner missing: ${nm}`); });
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
    // transfer-to-relatives clause present
    if (!has("to an immediate family member")) errs.push("transfer-to-relatives clause MISSING");
    // unanimous => no Super Majority Defined glossary
    if (c.voting === "unanimous" && /Super Majority Defined/.test(t)) errs.push("unanimous but Super Majority Defined present");
    if (errs.length) { fails++; failList.push(label + " :: " + errs.join(" | ")); console.log(`🔴 ${label}`); errs.forEach((e) => console.log("     " + e)); }
    else process.stdout.write(`\r✓ ${i + 1}/100   `);
  }
  console.log("\n" + "=".repeat(56));
  console.log(fails === 0 ? "✅ 100/100 variants PASS (structure + content)" : `🔴 ${fails}/100 FAILED:\n` + failList.join("\n"));
  process.exit(fails === 0 ? 0 : 1);
})();
