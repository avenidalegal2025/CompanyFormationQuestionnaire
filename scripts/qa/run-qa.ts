/* Agreement QA runner — layers 2-4 through the real production transform.
 *
 *   npx tsx scripts/qa/run-qa.ts [--realistic 3000] [--seed 1] [--layers realistic,pairwise,edge]
 *                                [--audit] [--out <dir>]
 *
 * For every case: payload -> mapFormToDocgenAnswers -> generateDocument ->
 * expectations + invariants (+ the structural auditor with --audit).
 * Failures are grouped by rule; the first examples of each rule are saved
 * (docx + case JSON) under <out>/examples/<rule>/ for inspection.
 * Exit code 1 when any FAIL is found.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";
import { mapFormToDocgenAnswers } from "../../src/lib/agreement-mapper.js";
import { generateDocument } from "../../src/lib/agreement-docgen.js";
import { Case, rng, sampleRealistic, toPayload } from "./model.js";
import { pairwiseCases } from "./pairwise.js";
import { edgeCases } from "./edge.js";
import { expectations, invariants, readDoc, Finding } from "./checks.js";

const arg = (name: string, dflt: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const N = +arg("realistic", "3000");
const SEED = +arg("seed", "1");
const LAYERS = arg("layers", "realistic,pairwise,edge").split(",");
const AUDIT = process.argv.includes("--audit");
const OUT = arg("out", path.join(os.tmpdir(), "agreement-qa"));
const EXAMPLES_PER_RULE = 3;

const cases: Case[] = [];
if (LAYERS.includes("edge")) cases.push(...edgeCases());
if (LAYERS.includes("pairwise")) cases.push(...pairwiseCases(SEED));
if (LAYERS.includes("realistic")) { const r = rng(SEED); for (let i = 0; i < N; i++) cases.push(sampleRealistic(r, i)); }

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "examples"), { recursive: true });
const tmpDocx = path.join(OUT, "_audit.docx");

type Agg = { sev: string; count: number; byLayer: Record<string, number>; examples: { id: string; msg: string }[] };
const agg = new Map<string, Agg>();
const failedCases = new Set<string>();
const t0 = Date.now();

(async () => {
  const quiet = console.log; console.log = () => {};          // silence generator chatter
  for (const [i, c] of cases.entries()) {
    let found: Finding[] = [];
    let buf: Buffer | null = null;
    try {
      const answers = await mapFormToDocgenAnswers(toPayload(c));
      buf = (await generateDocument(answers)).buffer;
      const doc = readDoc(buf);
      found = [...expectations(c, doc), ...invariants(c, doc)];
      if (AUDIT && c.layer !== "realistic") {
        fs.writeFileSync(tmpDocx, buf);
        const out = (() => { try { return execFileSync("node", ["scripts/audit-corp-structure.mjs", tmpDocx], { encoding: "utf8" }); } catch (e: any) { return String(e.stdout || e.message); } })();
        if (!out.includes("CLEAN")) found.push({ rule: "A-structural-audit", sev: "FAIL", msg: (out.match(/[^\n]*(issue|roman|letter sequence|no parent)[^\n]*/g) || ["not clean"]).slice(0, 2).join(" | ") });
      }
    } catch (e: any) {
      found.push({ rule: "E-generator-threw", sev: "FAIL", msg: String(e?.message || e).slice(0, 160) });
    }
    for (const fd of found) {
      const a = agg.get(fd.rule) || { sev: fd.sev, count: 0, byLayer: {}, examples: [] };
      a.count++; a.byLayer[c.layer] = (a.byLayer[c.layer] || 0) + 1;
      if (a.examples.length < EXAMPLES_PER_RULE && !a.examples.some((x) => x.id === c.id)) {
        a.examples.push({ id: c.id, msg: fd.msg });
        const dir = path.join(OUT, "examples", fd.rule); fs.mkdirSync(dir, { recursive: true });
        if (buf) fs.writeFileSync(path.join(dir, `${c.id}.docx`), buf);
        fs.writeFileSync(path.join(dir, `${c.id}.case.json`), JSON.stringify(c, null, 2));
      }
      agg.set(fd.rule, a);
      if (fd.sev === "FAIL") failedCases.add(c.id);
    }
    if ((i + 1) % 250 === 0) quiet(`  ${i + 1}/${cases.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.log = quiet;

  const byLayer: Record<string, number> = {};
  for (const c of cases) byLayer[c.layer] = (byLayer[c.layer] || 0) + 1;
  const rules = [...agg.entries()].sort((a, b) => (a[1].sev === b[1].sev ? b[1].count - a[1].count : a[1].sev === "FAIL" ? -1 : 1));
  const lines = [
    `# Agreement QA — ${new Date().toISOString().slice(0, 16)}`,
    `${cases.length} documents (${Object.entries(byLayer).map(([k, v]) => `${k} ${v}`).join(", ")}) in ${((Date.now() - t0) / 1000).toFixed(0)}s · seed ${SEED}`,
    `**${failedCases.size} documents with at least one FAIL**`, "",
    `| sev | rule | docs | by layer | example |`, `|---|---|---|---|---|`,
    ...rules.map(([r, a]) => `| ${a.sev} | ${r} | ${a.count} | ${Object.entries(a.byLayer).map(([k, v]) => `${k}:${v}`).join(" ")} | ${a.examples[0].id}: ${a.examples[0].msg.replace(/\|/g, "/").slice(0, 140)} |`),
  ];
  fs.writeFileSync(path.join(OUT, "report.md"), lines.join("\n"));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(Object.fromEntries(rules), null, 2));
  console.log(lines.join("\n"));
  console.log(`\nreport: ${path.join(OUT, "report.md")}`);
  process.exit(failedCases.size ? 1 : 0);
})();
