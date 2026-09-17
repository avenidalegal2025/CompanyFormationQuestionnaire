/**
 * Full answer-coverage audit: does every agreement question actually do
 * something?
 *
 * For each question in the agreement steps, this reads the options straight out
 * of the step component, generates the DOCX with two different answers, and
 * builds the Airtable record for both. It then reports where the answer lands:
 *
 *   DOC      the agreement text changes  → the answer reaches the contract
 *   SHEET    only the Airtable record changes → Antonio sees it, the contract doesn't
 *   NOWHERE  neither changes → the customer answers a question that does nothing
 *
 * Anything in NOWHERE is either a question to wire up or a question to remove.
 * This is the wider version of audit-toggle-coverage.ts (which guards a curated
 * list and fails the build); this one is a report for deciding what to do.
 *
 *   npx tsx scripts/audit-every-answer.ts [--entity llc|corp]
 */
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { fileURLToPath } from "url";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper.js";
import { generateDocument } from "../src/lib/agreement-docgen.js";
import { mapQuestionnaireToAirtable } from "../src/lib/airtable.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEPS = path.join(HERE, "..", "src", "components", "steps");
const FIX = path.join(HERE, "fixtures");
const STEP_FILES = ["Step6Agreement1.tsx", "Step7Agreement2.tsx", "Step8Agreement3.tsx", "Step9Agreement4.tsx"];

/** Fields the customer never answers directly (seeded numbers, free text). */
const SKIP = new Set(["llc_taxPartner", "corp_taxOwner"]);

type Question = { field: string; step: string; values: string[] };

/**
 * Some answers only do anything once another answer opens the door:
 * a super-majority percentage is unused unless something is decided by Super
 * Majority, and the per-owner roles are only written when the roles have text.
 * Without this context the audit reports those questions as dead when they are
 * merely conditional, so both variants are generated with the door open.
 */
const CONTEXT: Record<string, { llc?: Record<string, unknown>; corp?: Record<string, unknown> }> = {
  supermajorityThreshold: {
    llc: { llc_majorDecisions: "Supermayoría" },
    corp: { corp_majorDecisionThreshold: "Supermayoría" },
  },
  llc_hasSpecificRoles: {
    llc: { llc_specificRoles_0: "CEO", llc_roleDesc_0: "Dirige la operación diaria." },
  },
  corp_hasSpecificResponsibilities: {
    corp: { corp_specificResponsibilities_0: "CEO", corp_responsibilityDesc_0: "Dirige la operación diaria." },
  },
};

/**
 * Pull each question and its selectable values out of the component source, so
 * the audit covers whatever the questionnaire currently asks — no hand-kept
 * list to drift.
 */
function questionsIn(file: string): Question[] {
  const src = fs.readFileSync(path.join(STEPS, file), "utf8");
  const out: Question[] = [];
  const seen = new Set<string>();
  const hits = [...src.matchAll(/(?:name=|register\()"agreement\.([A-Za-z0-9_]+)"/g)];
  for (let i = 0; i < hits.length; i++) {
    const field = hits[i][1];
    if (seen.has(field) || SKIP.has(field)) continue;
    seen.add(field);
    // Only this question's own markup: stop at the next question, or the
    // options of the following one get attributed to this field.
    const block = src.slice(hits[i].index!, hits[i + 1]?.index ?? src.length);
    const opts = [...block.matchAll(/\{\s*value:\s*"([^"]*)"/g)].map((o) => o[1]).filter(Boolean);
    const sel = [...block.matchAll(/<option value="([^"]+)"/g)].map((o) => o[1]);
    const values = (opts.length ? opts : sel).slice(0, 4);
    // numeric inputs (thresholds, spending limits, day counts) have no options
    out.push({ field, step: file, values: values.length >= 2 ? values : ["1234", "98765"] });
  }
  return out;
}

function docText(buf: Buffer): string {
  let off = 0;
  while (off < buf.length - 4) {
    if (buf.readUInt32LE(off) === 0x04034b50) {
      const cmp = buf.readUInt16LE(off + 8);
      const csize = buf.readUInt32LE(off + 18);
      const fnl = buf.readUInt16LE(off + 26);
      const ds = off + 30 + fnl + buf.readUInt16LE(off + 28);
      if (buf.toString("utf8", off + 30, off + 30 + fnl) === "word/document.xml") {
        const raw = buf.subarray(ds, ds + csize);
        return (cmp === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw))
          .toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      }
      off = ds + csize;
    } else off++;
  }
  return "";
}

// The generator and mapper log a lot; keep the report readable.
const QUIET = !process.argv.includes("--verbose");
const realLog = console.log;
function silence<T>(fn: () => Promise<T>): Promise<T> {
  if (!QUIET) return fn();
  const noop = () => {};
  const { log, warn, info, error } = console;
  Object.assign(console, { log: noop, warn: noop, info: noop, error: noop });
  return fn().finally(() => Object.assign(console, { log, warn, info, error }));
}

const STRIPE = { id: "cs_audit", amount_total: 0, customer_details: { email: "audit@example.com" } };

async function variant(base: any, field: string, value: string, entity: string) {
  const d = JSON.parse(JSON.stringify(base));
  const context = CONTEXT[field]?.[entity === "LLC" ? "llc" : "corp"] || {};
  d.agreement = { ...(d.agreement || {}), ...context, [field]: value };
  return silence(async () => {
    const doc = docText((await generateDocument(await mapFormToDocgenAnswers(d))).buffer);
    const sheet = JSON.stringify(mapQuestionnaireToAirtable(d, STRIPE));
    return { doc, sheet };
  });
}

(async () => {
  const only = process.argv.includes("--entity") ? process.argv[process.argv.indexOf("--entity") + 1] : null;
  const bases: Array<[string, any]> = [];
  if (only !== "corp") bases.push(["LLC", JSON.parse(fs.readFileSync(path.join(FIX, "llc-base.payload.json"), "utf8"))]);
  if (only !== "llc") bases.push(["Corp", JSON.parse(fs.readFileSync(path.join(FIX, "corp-base.payload.json"), "utf8"))]);

  const rows: Array<{ entity: string; field: string; where: string; values: string }> = [];
  for (const [entity, base] of bases) {
    const prefix = entity === "LLC" ? "llc_" : "corp_";
    for (const file of STEP_FILES) {
      for (const q of questionsIn(file)) {
        const shared = !q.field.startsWith("llc_") && !q.field.startsWith("corp_");
        if (!shared && !q.field.startsWith(prefix)) continue;
        const [a, b] = [q.values[0], q.values[q.values.length - 1]];
        if (a === b) continue;
        const A = await variant(base, q.field, a, entity);
        const B = await variant(base, q.field, b, entity);
        const where = A.doc !== B.doc ? "DOC" : A.sheet !== B.sheet ? "SHEET" : "NOWHERE";
        rows.push({ entity, field: q.field, where, values: `${a.slice(0, 18)} → ${b.slice(0, 18)}` });
        process.stdout.write(where === "NOWHERE" ? "x" : where === "SHEET" ? "-" : ".");
      }
    }
  }
  realLog("\n");
  for (const group of ["NOWHERE", "SHEET", "DOC"]) {
    const g = rows.filter((r) => r.where === group);
    const icon = group === "DOC" ? "✓" : group === "SHEET" ? "◐" : "🔴";
    realLog(`${icon} ${group} (${g.length})`);
    for (const r of g) realLog(`    ${r.entity.padEnd(5)} ${r.field.padEnd(38)} ${r.values}`);
    realLog("");
  }
  const dead = rows.filter((r) => r.where === "NOWHERE").length;
  realLog(dead ? `🔴 ${dead} question(s) change nothing at all.` : "✅ every question lands somewhere.");
})();
