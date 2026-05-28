/**
 * Toggle-coverage guard.
 *
 * For every USER-FACING agreement toggle, this generates two variants that
 * differ ONLY in that toggle and asserts the produced DOCX actually changes.
 * A toggle the questionnaire collects but the document ignores is a silent
 * legal defect (the client's choice is dropped) — we have shipped FOUR of
 * these (nonsolicitation, confidentiality, incapacity/heirs, transfer-to-
 * relatives). This guard makes that class impossible to ship unnoticed.
 *
 * Run:  npx tsx scripts/audit-toggle-coverage.ts
 * Exit 1 if any toggle that is expected to be wired produces an identical doc.
 * Toggles in PENDING_ANTONIO are known-dead awaiting attorney clause text and
 * are reported but do not fail the build (so the guard stays green until they
 * are wired, then they graduate out of the allowlist).
 */
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { fileURLToPath } from "url";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper.js";
import { generateDocument } from "../src/lib/agreement-docgen.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LLC_BASE = path.join(HERE, "fixtures", "llc-base.payload.json");
const CORP_BASE = path.join(HERE, "fixtures", "corp-base.payload.json");

function docXmlText(buf: Buffer): string {
  let off = 0;
  const sig = 0x04034b50;
  while (off < buf.length - 4) {
    if (buf.readUInt32LE(off) === sig) {
      const cmp = buf.readUInt16LE(off + 8);
      const csize = buf.readUInt32LE(off + 18);
      const fnlen = buf.readUInt16LE(off + 26);
      const extlen = buf.readUInt16LE(off + 28);
      const fn = buf.toString("utf8", off + 30, off + 30 + fnlen);
      const ds = off + 30 + fnlen + extlen;
      if (fn === "word/document.xml") {
        const raw = buf.subarray(ds, ds + csize);
        const xml = (cmp === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw)).toString("utf8");
        return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      }
      off = ds + csize;
    } else off++;
  }
  return "";
}

type Case = {
  name: string;
  base: string; // payload path
  field: string; // agreement.<field>
  a: string;
  b: string;
};

const UNANIMOUS = "Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.";
const FREE = "Sí, podrán transferir libremente sus acciones.";

const CASES: Case[] = [
  // ── LLC ──────────────────────────────────────────────────────────
  { name: "LLC RoFR", base: LLC_BASE, field: "llc_rofr", a: "Yes", b: "No" },
  { name: "LLC Non-compete", base: LLC_BASE, field: "llc_nonCompete", a: "Yes", b: "No" },
  { name: "LLC Non-solicitation", base: LLC_BASE, field: "llc_nonSolicitation", a: "Yes", b: "No" },
  { name: "LLC Tag/Drag", base: LLC_BASE, field: "llc_tagDragRights", a: "Yes", b: "No" },
  { name: "LLC Incapacity→forced sale", base: LLC_BASE, field: "llc_heirsForcedToSell", a: "Yes", b: "No" },
  { name: "LLC Major-decisions voting", base: LLC_BASE, field: "llc_majorDecisions", a: "Mayoría", b: "Decisión Unánime" },
  { name: "LLC Transfer-to-relatives", base: LLC_BASE, field: "llc_transferToRelatives", a: FREE, b: UNANIMOUS },
  { name: "LLC Divorce buyout", base: LLC_BASE, field: "llc_divorceBuyoutPolicy", a: "Yes", b: "No" },
  // ── Corp ─────────────────────────────────────────────────────────
  { name: "Corp RoFR", base: CORP_BASE, field: "corp_rofr", a: "Yes", b: "No" },
  { name: "Corp Non-compete", base: CORP_BASE, field: "corp_nonCompete", a: "Yes", b: "No" },
  { name: "Corp Non-solicitation", base: CORP_BASE, field: "corp_nonSolicitation", a: "Yes", b: "No" },
  { name: "Corp Tag/Drag", base: CORP_BASE, field: "corp_tagDragRights", a: "Yes", b: "No" },
  { name: "Corp Incapacity→forced sale", base: CORP_BASE, field: "corp_heirsForcedToSell", a: "Yes", b: "No" },
  { name: "Corp Major-decisions voting", base: CORP_BASE, field: "corp_majorDecisionThreshold", a: "Mayoría", b: "Decisión Unánime" },
  { name: "Corp Transfer-to-relatives", base: CORP_BASE, field: "corp_transferToRelatives", a: FREE, b: UNANIMOUS },
  { name: "Corp Divorce buyout", base: CORP_BASE, field: "corp_divorceBuyoutPolicy", a: "Yes", b: "No" },
];

// Known-dead toggles awaiting Antonio's clause text/decision. Reported but not
// build-failing. Remove from this list as each is wired — then the guard
// enforces it stays wired.
const PENDING_ANTONIO = new Set<string>([
  "LLC Divorce buyout",
  "Corp Divorce buyout",
]);

async function genText(payloadPath: string, field: string, value: string): Promise<string> {
  const data = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  data.agreement = { ...(data.agreement || {}), [field]: value };
  const answers = await mapFormToDocgenAnswers(data);
  const { buffer } = await generateDocument(answers);
  return docXmlText(buffer);
}

(async () => {
  let hardFail = 0;
  let pendingDead = 0;
  console.log("Toggle-coverage guard — each toggle must change the generated document\n");
  console.log("  " + "TOGGLE".padEnd(34) + "RESULT");
  console.log("  " + "-".repeat(50));
  for (const c of CASES) {
    let differ: boolean;
    try {
      const [ta, tb] = await Promise.all([genText(c.base, c.field, c.a), genText(c.base, c.field, c.b)]);
      differ = ta !== tb;
    } catch (e) {
      console.log("  " + c.name.padEnd(34) + "ERROR: " + (e as Error).message);
      hardFail++;
      continue;
    }
    const pending = PENDING_ANTONIO.has(c.name);
    let verdict: string;
    if (differ) {
      verdict = "✓ WIRED";
      if (pending) verdict += "  (was pending — graduate it out of PENDING_ANTONIO!)";
    } else if (pending) {
      verdict = "⏳ DEAD — pending Antonio clause text";
      pendingDead++;
    } else {
      verdict = "🔴 DEAD — toggle ignored by docgen (regression!)";
      hardFail++;
    }
    console.log("  " + c.name.padEnd(34) + verdict);
  }
  console.log("\n  " + "-".repeat(50));
  console.log(`  ${CASES.length} toggles · ${hardFail} unexpected-dead · ${pendingDead} pending-Antonio`);
  if (hardFail > 0) {
    console.log("\n🔴 FAIL: a toggle the questionnaire collects is ignored by the document.");
    process.exit(1);
  }
  console.log("\n✅ PASS: every wired toggle changes the document; only known-pending toggles remain dead.");
})();
