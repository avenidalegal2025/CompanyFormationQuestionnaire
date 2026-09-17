/**
 * "What the customer answered is what the document says" regression test.
 *
 * Covers the two defects found on 2026-09-17:
 *   A. The capital-contributions vote only reached the first sentence of LLC
 *      §5.1; the second sentence was rewritten by the major-decisions sweep.
 *   B. The voting thresholds (50.01 / 75) were shown in the questionnaire but
 *      never saved, so the agreement fell back to 50% and — worse — dropped the
 *      "Super Majority Defined" clause while still deciding things by Super
 *      Majority.
 *
 *   npx tsx scripts/test-answer-fidelity.ts
 */
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { fileURLToPath } from "url";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper.js";
import { generateDocument } from "../src/lib/agreement-docgen.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures");
const LLC = JSON.parse(fs.readFileSync(path.join(FIX, "llc-base.payload.json"), "utf8"));
const CORP = JSON.parse(fs.readFileSync(path.join(FIX, "corp-base.payload.json"), "utf8"));

function payload(base: any, overrides: Record<string, unknown>, drop: string[] = []) {
  const d = JSON.parse(JSON.stringify(base));
  d.agreement = { ...(d.agreement || {}), ...overrides };
  for (const k of drop) delete d.agreement[k];
  return d;
}

function docText(buf: Buffer): string {
  let off = 0;
  while (off < buf.length - 4) {
    if (buf.readUInt32LE(off) === 0x04034b50) {
      const cmp = buf.readUInt16LE(off + 8);
      const csize = buf.readUInt32LE(off + 18);
      const ds = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const fn = buf.toString("utf8", off + 30, off + 30 + buf.readUInt16LE(off + 26));
      if (fn === "word/document.xml") {
        const raw = buf.subarray(ds, ds + csize);
        return (cmp === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw))
          .toString("utf8")
          .replace(/<\/w:p>/g, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
          .replace(/[ \t ]+/g, " ");
      }
      off = ds + csize;
    } else off++;
  }
  return "";
}

const text = async (data: any) => docText((await generateDocument(await mapFormToDocgenAnswers(data))).buffer);

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "🔴"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures.push(label);
}

const VOTES: Array<[string, string]> = [
  ["Mayoría", "Majority"],
  ["Supermayoría", "Super Majority"],
  ["Decisión Unánime", "Unanimous"],
];

(async () => {
  console.log("Answer-fidelity test — the document must repeat the customer's answer\n");

  // A. Capital-contributions vote — LLC §5.1 says it twice; both must agree.
  console.log("LLC §5.1 additional capital (both sentences):");
  for (const [answer, expected] of VOTES) {
    const t = await text(payload(LLC, { llc_additionalContributionsDecision: answer, llc_majorDecisions: "Supermayoría" }));
    const first = t.match(/have agreed by ([A-Za-z ]+?) to the incurrence/)?.[1]?.trim();
    const second = t.match(/shall be made solely upon the ([A-Za-z ]+?) vote of the Members/)?.[1]?.trim();
    const norm = (s?: string) => (s || "").replace(/ vote$/, "");
    check(`${answer} → "${expected}" in both sentences`,
      norm(first) === expected && norm(second) === expected,
      `first="${first}" second="${second}"`);
  }

  // Corp equivalent (§4.5) — same answer, different clause wording.
  console.log("\nCorp §4.5 additional capital:");
  for (const [answer, expected] of VOTES) {
    const t = await text(payload(CORP, { corp_moreCapitalDecision: answer, corp_majorDecisionThreshold: "Supermayoría" }));
    const got = t.match(/raise additional capital shall be made with the ([A-Za-z ]+?) approval of the Shareholders/)?.[1]?.trim();
    check(`${answer} → "${expected}"`, (got || "").replace(/ vote$/, "") === expected, `got="${got}"`);
  }

  // B. Thresholds absent (old drafts, or a customer who never touched the box):
  //    the agreement must still define every term it uses.
  console.log("\nThresholds left untouched:");
  const DROP = ["majorityThreshold", "supermajorityThreshold"];
  const llcSuper = await text(payload(LLC, { llc_majorDecisions: "Supermayoría" }, DROP));
  check("LLC defines Super Majority when it decides by Super Majority",
    llcSuper.includes("Super Majority") && /Super Majority Defined/.test(llcSuper));
  check("LLC majority percentage is the 50.01% shown in the questionnaire",
    llcSuper.includes("50.01%"), llcSuper.match(/\d{2}\.?\d*%/g)?.slice(0, 5).join(" ") || "no % found");

  const corpSuper = await text(payload(CORP, { corp_majorDecisionThreshold: "Supermayoría" }, DROP));
  check("Corp defines Super Majority when it decides by Super Majority",
    /Super Majority\. Shareholders collectively holding greater than/.test(corpSuper));
  check("Corp majority percentage is 50.01%", corpSuper.includes("50.01%"));

  // The percentages written into the text follow the threshold the customer set
  // (LLC drag-along §12.9, Corp Approved Sale §13.3).
  console.log("\nMajority percentage at a non-default 60%:");
  for (const [base, label] of [[LLC, "LLC"], [CORP, "Corp"]] as const) {
    const t = await text(payload(base, { majorityThreshold: 60 }));
    check(`${label} keeps no stale 50.1% anywhere`, !t.includes("50.1%"),
      t.split("\n").filter((l) => l.includes("50.1%"))[0]?.slice(0, 120) || "");
  }

  // An agreement that never uses Super Majority must not define the term.
  const llcNoSuper = await text(payload(LLC, {
    llc_majorDecisions: "Mayoría", llc_companySaleDecision: "Mayoría", llc_dissolutionDecision: "Mayoría",
    llc_newMembersAdmission: "Mayoría", llc_officerRemovalVoting: "Mayoría",
    llc_memberLoansVoting: "Mayoría", llc_additionalContributionsDecision: "Mayoría",
  }, DROP));
  check("No unused Super Majority definition when nothing uses it",
    !/Super Majority Defined/.test(llcNoSuper));

  console.log(failures.length ? `\n🔴 FAIL: ${failures.length} check(s) failed.` : "\n✅ PASS");
  process.exit(failures.length ? 1 : 0);
})();
