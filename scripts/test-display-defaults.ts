/**
 * No question may render an answer the form does not store.
 *
 * The defect this guards against looks harmless in a diff:
 *
 *     value={(field.value as string) ?? "Yes"}
 *
 * The toggle paints "Yes" as chosen, but react-hook-form still holds
 * undefined. A customer who agrees with what is on screen and presses
 * Continue saves nothing, and every consumer downstream that asks
 * `=== "Yes"` takes the other branch. It is invisible in review, invisible
 * on screen, and only shows up in the finished document.
 *
 * Measured consequence on 2026-09-17 (scripts/fixtures/llc-base.payload.json,
 * documents generated both ways): with `admin.managersAllOwners` shown as
 * "Yes" but unsaved, buildManagers (agreement-mapper.ts:163) fell to the
 * explicit-manager branch with managersCount = 0 and the LLC Operating
 * Agreement was produced with NO Managers designated -- the clause naming
 * "Roberto Mendez, Ana Garcia, ..." as Managers was absent entirely.
 *
 * The rule, therefore: a step component renders form state and nothing else.
 * An intended default belongs in ONE place -- defaultFormValues in
 * src/app/page.tsx -- where it is actually stored. A question with no
 * defensible default gets none, and is made required in the schema instead.
 *
 *   npx tsx scripts/test-display-defaults.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const STEPS = path.join(ROOT, "src", "components", "steps");

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "🔴"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures.push(label);
}

console.log("Display defaults — every option shown as chosen must be stored\n");

// Matched broadly, then filtered below -- a negative lookahead here silently
// backtracks over the whitespace and lets `?? ""` through.
const RENDER_DEFAULT = /value=\{\s*\(?\s*field\.value(?:\s+as\s+[A-Za-z<>[\]| ]+)?\s*\)?\s*\?\?([^}]+)\}/g;

// An empty string renders nothing as chosen, which is the truthful rendering
// of "not answered yet". Any other literal paints an answer the form does not
// have.
const BENIGN = new Set(['""', "''", "undefined", "null"]);

const offenders: string[] = [];
for (const file of fs.readdirSync(STEPS).filter((f) => f.endsWith(".tsx"))) {
  const lines = fs.readFileSync(path.join(STEPS, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    RENDER_DEFAULT.lastIndex = 0;
    const m = RENDER_DEFAULT.exec(line);
    if (!m) return;
    const literal = m[1].trim();
    if (BENIGN.has(literal)) return;
    offenders.push(`${file}:${i + 1} renders ${literal} as the default`);
  });
}
check(
  "no step component invents an answer at render time",
  offenders.length === 0,
  offenders.join("; ")
);

// The defaults that ARE intended must genuinely be in defaultFormValues, so
// that what the customer sees is what gets submitted. Checked by reading the
// literal out of page.tsx rather than trusting a comment.
const page = fs.readFileSync(path.join(ROOT, "src", "app", "page.tsx"), "utf8");
const block = page.slice(page.indexOf("const defaultFormValues"));
const REQUIRED_DEFAULTS: [string, string][] = [
  ["entityType", "LLC"],
  ["entitySuffix", "LLC"],
  ["formationState", "Florida"],
  // Shown as "No" so the customer is offered the address/phone service; the
  // value must be stored or airtable.ts:787 and agreement-mapper.ts:339 take
  // the "has their own address" branch with no address to use.
  ["hasUsaAddress", "No"],
  ["hasUsPhone", "No"],
  // The Managers clause above depends on this one.
  ["managersAllOwners", "Yes"],
  ["officersAllOwners", "Yes"],
  ["directorsAllOwners", "Yes"],
];
for (const [key, value] of REQUIRED_DEFAULTS) {
  const re = new RegExp(`\\b${key}\\s*:\\s*["']${value}["']`);
  check(`defaultFormValues stores ${key} = "${value}"`, re.test(block));
}

console.log(
  failures.length ? `\n🔴 FAIL: ${failures.length} check(s).` : "\n✅ PASS"
);
process.exit(failures.length ? 1 : 0);
