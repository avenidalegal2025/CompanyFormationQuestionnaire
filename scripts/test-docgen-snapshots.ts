/**
 * Golden text-snapshot regression test for document generation.
 *
 * For a fixed, representative set of variants, this generates the agreement
 * through the REAL production transform (mapFormToDocgenAnswers →
 * generateDocument), extracts the paragraph text, normalizes volatile bits
 * (dates), and compares against a committed snapshot. ANY change to the
 * generated document — wording, numbering, a clause appearing/disappearing,
 * a toggle's effect — shows up as a snapshot diff that a human must review.
 * This is the entity-agnostic safety net: it would have caught every docgen
 * regression we hit (underline, §11.7 doubling, the dead toggles, etc.).
 *
 *   npx tsx scripts/test-docgen-snapshots.ts            # compare (CI mode)
 *   npx tsx scripts/test-docgen-snapshots.ts --update   # rewrite snapshots
 *
 * After an INTENTIONAL output change: run --update, then review the diff in
 * `git diff tests/__snapshots__/docgen/` before committing.
 */
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { fileURLToPath } from "url";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper.js";
import { generateDocument } from "../src/lib/agreement-docgen.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures");
const SNAP_DIR = path.join(HERE, "..", "tests", "__snapshots__", "docgen");
const LLC = JSON.parse(fs.readFileSync(path.join(FIX, "llc-base.payload.json"), "utf8"));
const CORP = JSON.parse(fs.readFileSync(path.join(FIX, "corp-base.payload.json"), "utf8"));

function withAgreement(base: any, overrides: Record<string, unknown>) {
  const d = JSON.parse(JSON.stringify(base));
  d.agreement = { ...(d.agreement || {}), ...overrides };
  return d;
}

// Representative variants — each exercises a distinct structural path. Keep the
// set small + meaningful; add a case when a new structural branch appears.
const VARIANTS: { name: string; data: any }[] = [
  { name: "llc-all-on", data: LLC },
  {
    name: "llc-all-off",
    data: withAgreement(LLC, {
      llc_rofr: "No", llc_nonCompete: "No", llc_nonSolicitation: "No",
      llc_tagDragRights: "No", llc_heirsForcedToSell: "No",
      llc_majorDecisions: "Mayoría", llc_companySaleDecision: "Mayoría",
      llc_dissolutionDecision: "Mayoría",
    }),
  },
  {
    name: "llc-mixed",
    data: withAgreement(LLC, {
      llc_rofr: "Yes", llc_nonCompete: "Yes", llc_nonSolicitation: "No",
      llc_tagDragRights: "No", llc_heirsForcedToSell: "Yes",
      llc_majorDecisions: "Supermayoría",
    }),
  },
  { name: "corp-all-on", data: CORP },
  {
    name: "corp-all-off",
    data: withAgreement(CORP, {
      corp_rofr: "No", corp_nonCompete: "No", corp_nonSolicitation: "No",
      corp_tagDragRights: "No", corp_heirsForcedToSell: "No",
      corp_majorDecisionThreshold: "Mayoría", corp_saleDecisionThreshold: "Mayoría",
    }),
  },
  {
    name: "corp-mixed",
    data: withAgreement(CORP, {
      corp_rofr: "Yes", corp_nonCompete: "Yes", corp_nonSolicitation: "No",
      corp_tagDragRights: "Yes", corp_heirsForcedToSell: "Yes",
      corp_majorDecisionThreshold: "Supermayoría",
    }),
  },
];

function docText(buf: Buffer): string {
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
        return normalize(xml);
      }
      off = ds + csize;
    } else off++;
  }
  return "";
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
function normalize(xml: string): string {
  return (
    xml
      // one paragraph per line so diffs are readable + line-oriented
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      // volatile: generation date (docgen uses new Date())
      .replace(new RegExp(`\\b(${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "g"), "<DATE>")
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, "<DATE>")
      .replace(/\b20\d{2}\b/g, "<YEAR>")
      .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n")
  );
}

(async () => {
  const update = process.argv.includes("--update");
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  let fail = 0;
  for (const v of VARIANTS) {
    const answers = await mapFormToDocgenAnswers(v.data);
    const { buffer } = await generateDocument(answers);
    const text = docText(buffer);
    const snapPath = path.join(SNAP_DIR, `${v.name}.snap.txt`);
    if (update) {
      fs.writeFileSync(snapPath, text);
      console.log(`  updated  ${v.name} (${text.length} chars)`);
      continue;
    }
    if (!fs.existsSync(snapPath)) {
      console.log(`  🔴 MISSING snapshot for ${v.name} — run with --update`);
      fail++;
      continue;
    }
    const expected = fs.readFileSync(snapPath, "utf8");
    if (expected === text) {
      console.log(`  ✓ ${v.name}`);
    } else {
      fail++;
      const el = expected.split("\n");
      const al = text.split("\n");
      const firstDiff = Math.max(0, al.findIndex((l, i) => l !== el[i]));
      console.log(`  🔴 ${v.name} CHANGED (${el.length}→${al.length} lines; first diff line ${firstDiff + 1}):`);
      console.log(`       - ${JSON.stringify((el[firstDiff] || "").slice(0, 120))}`);
      console.log(`       + ${JSON.stringify((al[firstDiff] || "").slice(0, 120))}`);
    }
  }
  console.log("");
  if (update) {
    console.log(`✅ wrote ${VARIANTS.length} snapshots to tests/__snapshots__/docgen/`);
    return;
  }
  if (fail > 0) {
    console.log(`🔴 ${fail}/${VARIANTS.length} snapshots changed. If intentional: re-run with --update and review \`git diff tests/__snapshots__/docgen/\`.`);
    process.exit(1);
  }
  console.log(`✅ all ${VARIANTS.length} document snapshots match.`);
})();
