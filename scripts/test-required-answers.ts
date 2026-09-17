/**
 * Guard for the "pre-selected but unsaved answer" bug class.
 *
 * An agreement question used to render an option as selected
 * (`field.value || "Decisión Unánime"`) without writing it to the form, so an
 * untouched question saved nothing and the document silently used a different
 * fallback. The fix was: questions start empty, and every one of them is
 * required before "Continuar"/checkout (src/lib/required-answers.ts).
 *
 * This test fails if that can regress:
 *   1. a step component re-introduces a pre-selected default;
 *   2. a question exists in a step but nobody requires an answer for it;
 *   3. required-answers.ts names a question the step no longer has.
 *
 *   npx tsx scripts/test-required-answers.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { AGREEMENT_REQUIRED_ANSWERS } from "../src/lib/required-answers.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEPS_DIR = path.join(HERE, "..", "src", "components", "steps");

/** Questionnaire step number → component file (see src/app/page.tsx). */
const STEP_FILES: Record<number, string> = {
  5: "Step6Agreement1.tsx",
  6: "Step7Agreement2.tsx",
  7: "Step8Agreement3.tsx",
  8: "Step9Agreement4.tsx",
};

/**
 * Fields that legitimately need no answer from the customer: numbers whose
 * shown value is written into the form by useSeededDefaults, and free text that
 * only appears after a Yes.
 */
const NOT_REQUIRED = new Set([
  "agreement.majorityThreshold",
  "agreement.supermajorityThreshold",
  "agreement.corp_rofrOfferPeriod",
  "agreement.llc_rofrOfferPeriod",
  "agreement.corp_nonCompeteDuration",
  "agreement.corp_nonCompeteScope",
  "agreement.llc_nonCompeteDuration",
  "agreement.llc_nonCompeteScope",
  "agreement.llc_taxPartner",
]);

const failures: string[] = [];
const required = new Set(AGREEMENT_REQUIRED_ANSWERS.map((q) => q.name));

for (const [step, file] of Object.entries(STEP_FILES)) {
  const src = fs.readFileSync(path.join(STEPS_DIR, file), "utf8");

  // 1. no pre-selected defaults
  for (const m of src.matchAll(/field\.value \|\| "([^"]+)"/g)) {
    failures.push(`${file}: pre-selected default \`field.value || "${m[1]}"\` — use "" and add the question to required-answers.ts`);
  }
  for (const m of src.matchAll(/defaultValue=\{(?!\()/g)) {
    const line = src.slice(0, m.index).split("\n").length;
    failures.push(`${file}:${line}: defaultValue={…} shows a value that is never saved — seed it with useSeededDefaults instead`);
  }

  // 2. every question in the step is required somewhere
  const inStep = new Set(
    [...src.matchAll(/(?:name=|register\()"(agreement\.[A-Za-z0-9_]+)"/g)].map((m) => m[1])
  );
  for (const name of inStep) {
    if (!required.has(name) && !NOT_REQUIRED.has(name)) {
      failures.push(`${file}: question "${name}" is answerable but not in AGREEMENT_REQUIRED_ANSWERS (add it, or to NOT_REQUIRED here with a reason)`);
    }
  }

  // 3. required answers point at questions that still exist on that step
  for (const q of AGREEMENT_REQUIRED_ANSWERS.filter((q) => q.step === Number(step))) {
    if (!inStep.has(q.name)) {
      failures.push(`required-answers.ts: "${q.name}" is listed on step ${step} but ${file} has no such question`);
    }
  }
}

console.log("Required-answers guard — no pre-selected answers, every question required\n");
if (failures.length) {
  for (const f of failures) console.log(`  🔴 ${f}`);
  console.log(`\n🔴 FAIL: ${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`  ✓ ${Object.keys(STEP_FILES).length} steps · ${required.size} required questions · no pre-selected defaults`);
console.log("\n✅ PASS");
