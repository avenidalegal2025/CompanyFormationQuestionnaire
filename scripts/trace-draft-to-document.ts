/**
 * Answer-to-document tracer for a real human run-through.
 *
 * The existing mapping-fidelity checker builds its own synthetic answers, so
 * it can only prove the fields it thought to construct. This one starts from
 * an actual saved draft -- whatever a person really typed into the form --
 * flattens every answered leaf, generates the agreement from it, and reports
 * for each answer whether its value actually surfaces in the rendered
 * document.
 *
 * Usage:
 *   npx tsx scripts/trace-draft-to-document.ts <draftId> [baseUrl]
 *
 * The draft id is shown at the top of the questionnaire ("ID del borrador").
 * baseUrl defaults to http://localhost:3000 and must be a running server with
 * DynamoDB credentials, since the draft is fetched through /api/db/load.
 */
import { writeFileSync, mkdirSync } from "fs";
import PizZip from "pizzip";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

type Leaf = { path: string; value: string };

/** Paragraph text, not flattened text -- a value can "appear" in the XML and
 *  still never render, so read what the paragraphs actually say. */
function paragraphs(buf: Buffer): string[] {
  const xml = new PizZip(buf).file("word/document.xml")!.asText();
  return xml
    .split(/<w:p[ >]/)
    .slice(1)
    .map((p) => p.replace(/^[^>]*>/, "").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}

/** Every answered leaf as a dotted path, skipping empties and internals. */
function flatten(obj: unknown, prefix = "", out: Leaf[] = []): Leaf[] {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object") {
    const value = String(obj).trim();
    if (value !== "" && value !== "undefined") out.push({ path: prefix, value });
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    // Draft plumbing, not answers: ids, timestamps, and audit fields would
    // all report as "missing from the document" and drown the real signal.
    if (/^(pk|sk|draftId|updatedAt|createdAt|ownerId|schemaVersion)$/.test(k)) continue;
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

/** Values that are true answers but are never meant to reach the agreement. */
const NOT_EXPECTED_IN_AGREEMENT =
  /(^|\.)(email|phone|forwardPhone|hasUsAddress|hasUsPhone|passport|ssn|itin|dateOfBirth|address|country|city|zip|billing|coupon|price|step|currentStep)($|\.)/i;

async function main() {
  const draftId = process.argv[2];
  const baseUrl = process.argv[3] || "http://localhost:3000";
  if (!draftId) {
    console.error("usage: tsx scripts/trace-draft-to-document.ts <draftId> [baseUrl]");
    process.exit(2);
  }

  const res = await fetch(`${baseUrl}/api/db/load?draftId=${encodeURIComponent(draftId)}`);
  if (!res.ok) throw new Error(`draft fetch failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { ok: boolean; item: Record<string, unknown> | null };
  if (!json.item) throw new Error(`no draft found for id ${draftId}`);

  mkdirSync("Downloads/e2e-trace", { recursive: true });
  writeFileSync(
    `Downloads/e2e-trace/${draftId}.draft.json`,
    JSON.stringify(json.item, null, 2)
  );

  // The draft stores the form under a data/formData key depending on vintage;
  // accept either rather than failing on a draft saved by an older build.
  const item = json.item as Record<string, any>;
  const formData = item.formData ?? item.data ?? item;

  const leaves = flatten(formData);
  const answers = await mapFormToDocgenAnswers(formData as any);
  writeFileSync(
    `Downloads/e2e-trace/${draftId}.mapped.json`,
    JSON.stringify(answers, null, 2)
  );

  const doc = await generateDocument(answers as any);
  const docxPath = `Downloads/e2e-trace/${draftId}.docx`;
  writeFileSync(docxPath, doc.buffer);
  const paras = paragraphs(doc.buffer);
  const text = paras.join("\n");

  const found: Leaf[] = [];
  const missing: Leaf[] = [];
  const notExpected: Leaf[] = [];
  for (const leaf of leaves) {
    if (NOT_EXPECTED_IN_AGREEMENT.test(leaf.path)) {
      notExpected.push(leaf);
      continue;
    }
    // Percentages and money are formatted on the way in, so compare on the
    // numeric core rather than the raw string a person typed.
    const needle = leaf.value.replace(/[$,%\s]/g, "");
    const hay = text.replace(/[$,%\s]/g, "");
    (hay.includes(needle) ? found : missing).push(leaf);
  }

  const pct = (n: number) => ((n / Math.max(1, leaves.length)) * 100).toFixed(0);
  console.log(`\ndraft ${draftId}`);
  console.log(`  answered leaves : ${leaves.length}`);
  console.log(`  in document     : ${found.length} (${pct(found.length)}%)`);
  console.log(`  not applicable  : ${notExpected.length}`);
  console.log(`  MISSING         : ${missing.length}`);
  if (missing.length) {
    console.log(`\n  --- answers that never reach the agreement ---`);
    for (const m of missing) console.log(`  ✗ ${m.path} = ${JSON.stringify(m.value)}`);
  }
  console.log(`\n  docx      : ${docxPath}`);
  console.log(`  paragraphs: ${paras.length}`);
  console.log(
    `\nA MISSING row is not automatically a bug -- some answers legitimately ` +
      `only steer wording. Read each one against the document before calling it.\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
