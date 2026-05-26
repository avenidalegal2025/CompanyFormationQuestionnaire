/**
 * Payload -> output mapping-fidelity harness.
 *
 * For each formation, pulls the ACTUAL formData JSON the production webhook
 * stored (DynamoDB), runs it through the real production transformation
 * (mapFormToDocgenAnswers -> generateDocument), and asserts EVERY field of the
 * payload is faithfully reflected in the rendered agreement DOCX:
 *   entity + title, company name, owner COUNT + every NAME, ownership % per
 *   owner, major-decisions voting term, covenants (NC/NS), RoFR, drag/tag,
 *   managers (LLC) / directors + officers + roles (Corp), §N.M numbering.
 *
 * It diffs against the LITERAL stored payload (not a reconstructed one), so it
 * catches mapper-vs-product divergence — the 2026-05-19 review trap.
 *
 * Usage:
 *   npx tsx scripts/verify-payload-vs-output.ts                 # 8 most-recent agreement submissions
 *   npx tsx scripts/verify-payload-vs-output.ts --limit 20      # N most-recent
 *   npx tsx scripts/verify-payload-vs-output.ts --emails a@x.com,b@y.com
 *
 * Exit code 0 = every field matches on every formation; 1 = ≥1 mismatch
 * (CI-friendly). Creds/table from process.env, falling back to .env.local.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

// ── config: process.env first, then .env.local ──────────────────────────────
const dotenv: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) dotenv[m[1]] = m[2].replace(/\r$/, "").trim().replace(/^["']|["']$/g, "");
  }
}
const cfg = (k: string) => process.env[k]?.trim() || dotenv[k] || "";

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: cfg("AWS_REGION") || "us-west-1",
    credentials: { accessKeyId: cfg("AWS_ACCESS_KEY_ID"), secretAccessKey: cfg("AWS_SECRET_ACCESS_KEY") },
  }),
);
const TABLE = cfg("DYNAMO_TABLE") || "Company_Creation_Questionaire_Avenida_Legal";

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argVal = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
const LIMIT = Number(argVal("--limit") || 8);
const EMAILS = (argVal("--emails") || "").split(",").map((s) => s.trim()).filter(Boolean);

const VWORD: Record<string, string> = { "Mayoría": "Majority", "Supermayoría": "Super Majority", "Decisión Unánime": "Unanimous" };

// ── helpers ──────────────────────────────────────────────────────────────────
async function getFormData(email: string): Promise<any | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: email.toLowerCase(), sk: "DOMAINS" }, ProjectionExpression: "formData" }));
  return r.Item?.formData ?? null;
}

/** Scan for the N most-recent COMPLETE agreement submissions. */
async function recentAgreementPayloads(limit: number): Promise<Array<{ email: string; payload: any }>> {
  // Cheap pass: collect pk + formDataUpdatedAt for records that have formData.
  const candidates: Array<{ pk: string; updated: string }> = [];
  let ExclusiveStartKey: any;
  let scanned = 0;
  do {
    const r: any = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: "attribute_exists(formData)",
      ProjectionExpression: "pk, formDataUpdatedAt",
      ExclusiveStartKey,
    }));
    for (const it of r.Items || []) candidates.push({ pk: it.pk, updated: String(it.formDataUpdatedAt || "") });
    ExclusiveStartKey = r.LastEvaluatedKey;
    scanned += (r.Items || []).length;
  } while (ExclusiveStartKey && scanned < 5000);
  candidates.sort((a, b) => b.updated.localeCompare(a.updated));

  // Pull formData for the most-recent, keep complete agreement payloads until we have `limit`.
  const out: Array<{ email: string; payload: any }> = [];
  for (const c of candidates) {
    if (out.length >= limit) break;
    const fd = await getFormData(c.pk);
    if (fd?.agreement && fd.owners && Object.keys(fd.owners).length > 0 && fd.company?.entityType) out.push({ email: c.pk, payload: fd });
  }
  return out;
}

function paras(buf: Buffer): string[] {
  let e = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  let cd = buf.readUInt32LE(e + 16); const tot = buf.readUInt16LE(e + 10); let xml = "";
  for (let k = 0; k < tot; k++) {
    const nl = buf.readUInt16LE(cd + 28), el = buf.readUInt16LE(cd + 32), cl = buf.readUInt16LE(cd + 34), lho = buf.readUInt32LE(cd + 42), m = buf.readUInt16LE(cd + 10), cs = buf.readUInt32LE(cd + 20);
    const nm = buf.toString("utf8", cd + 46, cd + 46 + nl);
    if (nm === "word/document.xml") { const ds = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28); const z = buf.subarray(ds, ds + cs); xml = m === 0 ? z.toString("utf8") : inflateRawSync(z).toString("utf8"); break; }
    cd += 46 + nl + el + cl;
  }
  return xml.split(/<w:p[ >]/).slice(1).map((p) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join("").replace(/\s+/g, " ").trim()).filter(Boolean);
}

function numberingIssues(ps: string[]): string[] {
  const byArt: Record<number, number[]> = {};
  // (?!\s*%) excludes percentage cells like "33.00%" (not §33.0); real articles are 1..19.
  for (const t of ps) { const m = t.match(/^\s*(\d{1,2})\.(\d{1,2})(?!\d)(?!\s*%)/); if (!m) continue; const a = +m[1], s = +m[2]; if (a < 1 || a > 19) continue; (byArt[a] = byArt[a] || []).push(s); }
  const out: string[] = [];
  for (const a of Object.keys(byArt).map(Number).sort((x, y) => x - y)) {
    const seen = new Set<number>(), dup = new Set<number>();
    for (const s of byArt[a]) { if (seen.has(s)) dup.add(s); seen.add(s); }
    if (dup.size) out.push(`§${a} DUP ${[...dup].join(",")}`);
    const u = [...seen].sort((x, y) => x - y);
    for (let i = 1; i < u.length; i++) if (u[i] !== u[i - 1] + 1) out.push(`§${a} GAP ${a}.${u[i - 1]}->${a}.${u[i]}`);
  }
  return out;
}

async function verifyOne(label: string, fd: any): Promise<string[]> {
  const ag = fd.agreement || {}, admin = fd.admin || {};
  const entity = fd.company?.entityType || "LLC";
  const isCorp = entity === "C-Corp" || entity === "S-Corp";
  const ownerObjs = Object.keys(fd.owners || {}).sort((a, b) => +a - +b).map((k) => fd.owners[k]);
  const owners = ownerObjs.map((o: any) => ({ name: (o.fullName || `${o.firstName || ""} ${o.lastName || ""}`).trim(), pct: Number(o.ownershipPercentage) }));
  const ans: any = await mapFormToDocgenAnswers(fd as any);
  const ps = paras((await generateDocument(ans)).buffer);
  const blob = ps.join("\n");
  const fails: string[] = [];
  const check = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  check(isCorp ? /SHAREHOLDERS.? AGREEMENT/i.test(blob) : /OPERATING AGREEMENT/i.test(blob), `entity/title mismatch (payload ${entity})`);
  const coName = (fd.company?.companyName || "").replace(/,?\s*(LLC|Inc\.?|Corp\.?)$/i, "").trim();
  check(!coName || blob.toUpperCase().includes(coName.toUpperCase()), `company name "${coName}" not in doc`);

  let namesFound = 0;
  for (const o of owners) { if (o.name && blob.includes(o.name)) namesFound++; else check(false, `owner "${o.name}" MISSING from doc`); }
  check(namesFound === owners.length, `owner count: payload ${owners.length}, names found ${namesFound}`);

  for (const o of owners) {
    if (!Number.isFinite(o.pct)) continue;
    const vs = [`${o.pct}%`, `${o.pct}.00%`, `${o.pct.toFixed(2)}%`];
    check(vs.some((x) => blob.includes(x)), `owner "${o.name}" % ${o.pct} not rendered`);
  }

  const majEn = VWORD[isCorp ? ag.corp_majorDecisionThreshold : ag.llc_majorDecisions] || (isCorp ? ag.corp_majorDecisionThreshold : ag.llc_majorDecisions);
  if (majEn) {
    const anchor = isCorp ? /(Majority|Super Majority|Unanimous) affirmative vote of the Board of Directors/ : /(Majority|Super Majority|Unanimous) Approval of the Members shall be required/;
    const m = blob.match(anchor);
    check(!!m, `major-decisions voting anchor not found`);
    if (m) check(m[1] === majEn, `major-decisions voting: payload "${majEn}" but clause "${m[1]}"`);
  }

  const nc = (isCorp ? ag.corp_nonCompete : ag.llc_nonCompete) === "Yes";
  const ns = (isCorp ? ag.corp_nonSolicitation : ag.llc_nonSolicitation) === "Yes";
  check(nc === /Covenant Against Competition|Non-competition/.test(blob), `non-compete: payload ${nc} vs output ${!nc}`);
  check(ns === /Non-Solicitation/.test(blob), `non-solicitation: payload ${ns} vs output ${!ns}`);

  const rofr = (isCorp ? ag.corp_rofr : ag.llc_rofr) === "Yes";
  const dt = (isCorp ? ag.corp_tagDragRights : ag.llc_tagDragRights) === "Yes";
  check(rofr === /Right of First Refusal/.test(blob), `RoFR: payload ${rofr} vs output ${!rofr}`);
  check(dt === (/Drag Along/.test(blob) || /Tag Along/.test(blob)), `drag/tag: payload ${dt} vs output ${!dt}`);

  if (!isCorp) {
    const mgrs = admin.managersAllOwners === "Yes" ? owners.map((o) => o.name) : [1, 2, 3, 4, 5, 6].map((i) => admin[`manager${i}Name`]).filter(Boolean);
    const desig = ps.find((t) => /designate .* to serve as the Managers/.test(t)) || "";
    for (const mn of mgrs) check(desig.includes(mn), `manager "${mn}" not in §11.1.D`);
  } else {
    const dirs = admin.directorsAllOwners === "Yes" ? owners.map((o) => o.name) : [1, 2, 3, 4, 5, 6].map((i) => admin[`director${i}Name`]).filter(Boolean);
    const dirLine = ps.find((t) => /initial Directors shall be/.test(t)) || blob;
    for (const dn of dirs) check(dirLine.includes(dn) || blob.includes(dn), `director "${dn}" not in §10.5`);
    const offs = admin.officersAllOwners === "Yes"
      ? owners.map((o, i) => ({ name: o.name, role: admin[`shareholderOfficer${i + 1}Role`] }))
      : [1, 2, 3, 4, 5, 6].map((i) => ({ name: admin[`officer${i}Name`], role: admin[`officer${i}Role`] })).filter((o) => o.name);
    for (const off of offs) { check(blob.includes(off.name), `officer "${off.name}" not in doc`); if (off.role) check(blob.includes(off.role), `officer role "${off.role}" not in doc`); }
  }

  check(numberingIssues(ps).length === 0, `numbering: ${numberingIssues(ps).join("; ")}`);

  console.log(`\n=== ${label} ===`);
  console.log(`  ${entity} | owners=${owners.length} [${owners.map((o) => o.pct).join(",")}] | voting(major)=${majEn} | nc=${nc} ns=${ns} rofr=${rofr} dragTag=${dt} | names-found=${namesFound}/${owners.length}`);
  if (fails.length === 0) console.log(`  ✅ ALL FIELDS MATCH`);
  else { console.log(`  ❌ ${fails.length} MISMATCH:`); fails.forEach((f) => console.log(`     - ${f}`)); }
  return fails;
}

(async () => {
  let formations: Array<{ email: string; payload: any }>;
  if (EMAILS.length) {
    formations = [];
    for (const email of EMAILS) { const fd = await getFormData(email); if (fd) formations.push({ email, payload: fd }); else console.log(`⚠️  no formData for ${email}`); }
  } else {
    console.log(`Scanning ${TABLE} for the ${LIMIT} most-recent agreement submissions…`);
    formations = await recentAgreementPayloads(LIMIT);
  }
  if (!formations.length) { console.log("No formations to verify."); process.exit(2); }

  let totalFails = 0;
  for (const f of formations) {
    const co = f.payload.company?.companyName || f.email;
    totalFails += (await verifyOne(`${co}  [${f.email}]`, f.payload)).length;
  }
  console.log(`\n=================== ${totalFails === 0 ? "✅ ALL " + formations.length + " FORMATIONS — EVERY FIELD MATCHES PAYLOAD" : "❌ " + totalFails + " TOTAL MISMATCHES across " + formations.length + " formations"} ===================`);
  process.exit(totalFails === 0 ? 0 : 1);
})();
