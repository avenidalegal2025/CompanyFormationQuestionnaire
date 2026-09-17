/**
 * Guard: every Airtable column the code writes must exist in the base.
 *
 * Airtable rejects the whole record with UNKNOWN_FIELD_NAME if one field name
 * is wrong, so a single typo (or a column Antonio renames in the base) silently
 * stops the formation record from ever being created — the customer pays, the
 * document is generated, and nothing lands in the sheet.
 *
 * The column list of the Formations table is checked in at
 * scripts/fixtures/airtable-columns.json so this runs in CI without
 * credentials. Refresh it after changing the base:
 *
 *   npx tsx scripts/test-airtable-columns.ts            # check
 *   npx tsx scripts/test-airtable-columns.ts --refresh  # re-read the live base
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SNAPSHOT = path.join(HERE, "fixtures", "airtable-columns.json");

/** Read AIRTABLE_* out of .env.local (this script runs outside Next.js). */
function envLocal(): Record<string, string> {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function fetchColumns(table: string): Promise<string[]> {
  const env = { ...envLocal(), ...process.env } as Record<string, string>;
  const key = env.AIRTABLE_API_KEY?.trim();
  const baseId = env.AIRTABLE_BASE_ID?.trim();
  if (!key || !baseId) throw new Error("AIRTABLE_API_KEY / AIRTABLE_BASE_ID not set");
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Airtable meta API: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { tables: Array<{ name: string; fields: Array<{ name: string }> }> };
  const t = data.tables.find((x) => x.name === table);
  if (!t) throw new Error(`table "${table}" not found in the base`);
  return t.fields.map((f) => f.name).sort();
}

/** Column names the mapper writes, read straight out of the source. */
function columnsWrittenByCode(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "src", "lib", "airtable.ts"), "utf8");
  const names = new Set<string>();
  for (const m of src.matchAll(/record\[\s*['"]([^'"]+)['"]\s*\]\s*=/g)) names.add(m[1]);
  // The base record is an object literal: 'Column Name': value
  const start = src.indexOf("export function mapQuestionnaireToAirtable");
  const body = start >= 0 ? src.slice(start) : src;
  for (const m of body.matchAll(/^\s*'([^']{3,60})'\s*:/gm)) names.add(m[1]);
  return [...names].sort();
}

(async () => {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as {
    table: string; fetched: string; note: string; columns: string[];
  };

  if (process.argv.includes("--refresh")) {
    snapshot.columns = await fetchColumns(snapshot.table);
    snapshot.fetched = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1) + "\n");
    console.log(`Refreshed: ${snapshot.columns.length} columns in "${snapshot.table}".`);
  }

  console.log(`Airtable column guard — every column the code writes exists in "${snapshot.table}"\n`);
  const known = new Set(snapshot.columns);
  const used = columnsWrittenByCode();
  const missing = used.filter((c) => !known.has(c));

  if (missing.length) {
    for (const c of missing) {
      console.log(`  🔴 "${c}" is written by src/lib/airtable.ts but does not exist in Airtable`);
    }
    console.log(
      `\n🔴 FAIL: ${missing.length} unknown column(s). Airtable rejects the whole record,\n` +
      `   so the formation would never reach the sheet. Create the column in the base,\n` +
      `   fix the name, or drop the write — then re-run with --refresh.`
    );
    process.exit(1);
  }
  console.log(`  ✓ ${used.length} columns written · all present in the base (snapshot ${snapshot.fetched})`);
  console.log("\n✅ PASS");
})();
