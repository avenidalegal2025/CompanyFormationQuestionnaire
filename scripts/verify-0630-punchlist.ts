/**
 * The 2026-06-30 client-review punch list, as executable checks.
 *
 * verify-mapping-fidelity covers the field-level mapping (owners, covenants,
 * voting). This covers what it cannot see, because it strips tags and loses
 * paragraph boundaries: numbering continuity, orphan headers, the signature
 * block, and literal formatting conventions.
 *
 * Scenario is PF275 as Antonio reviewed it: a 3-member LLC split 33.33/33.33/
 * 33.34, non-compete on, drag/tag off, supermajority thresholds.
 */
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "fs";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

const OWNERS = [
  { fullName: "Roberto Mendez", firstName: "Roberto", lastName: "Mendez", ownership: 33.33 },
  { fullName: "Ana Garcia", firstName: "Ana", lastName: "Garcia", ownership: 33.33 },
  { fullName: "Carlos Lopez", firstName: "Carlos", lastName: "Lopez", ownership: 33.34 },
];

function formData(state = "Florida") {
  return {
    company: { entityType: "LLC", companyName: "PF275 LLC", companyNameBase: "PF275", entitySuffix: "LLC", hasUsAddress: "No", hasUsPhone: "No", formationState: state },
    ownersCount: 3,
    owners: Object.fromEntries(OWNERS.map((o, i) => [String(i), { ...o, ownershipPercentage: o.ownership, ownerType: "persona", isUsCitizen: "No" }])),
    admin: { managersAllOwners: "Yes" },
    agreement: {
      wants: "Yes", majorityThreshold: 50.01, supermajorityThreshold: 75, distributionFrequency: "Trimestral",
      llc_companySaleDecision: "Supermayoría", llc_bankSigners: "Dos firmantes", llc_majorDecisions: "Supermayoría",
      llc_majorSpendingThreshold: "15000", llc_officerRemovalVoting: "Supermayoría", llc_nonCompete: "Yes",
      llc_nonSolicitation: "Yes", llc_confidentiality: "Yes", llc_nonDisparagement: "Yes", llc_taxPartner: "Roberto Mendez",
      llc_minTaxDistribution: 30, llc_rofr: "Yes", llc_rofrOfferPeriod: 180, llc_tagDragRights: "No",
      llc_incapacityHeirsPolicy: "Yes", llc_dissolutionDecision: "Supermayoría", llc_newMembersAdmission: "Supermayoría",
      llc_newPartnersAdmission: "Supermayoría", llc_managingMembers: "Yes", llc_additionalContributions: "Sí, Pro-Rata",
      llc_additionalContributionsDecision: "Supermayoría", llc_memberLoans: "Yes", llc_memberLoansVoting: "Supermayoría",
      llc_capitalContributions_0: "50000", llc_capitalContributions_1: "50000", llc_capitalContributions_2: "50000",
    },
  };
}

/** Paragraphs, not flattened text — numbering only means something per-line. */
function paragraphs(buf: Buffer): string[] {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let o = buf.readUInt32LE(eocd + 16);
  while (buf.readUInt32LE(o) === 0x02014b50) {
    const cl = buf.readUInt16LE(o + 28), el = buf.readUInt16LE(o + 30), fl = buf.readUInt16LE(o + 32);
    const lho = buf.readUInt32LE(o + 42), nm = buf.toString("utf8", o + 46, o + 46 + cl);
    if (nm === "word/document.xml") {
      const ml = buf.readUInt16LE(lho + 28), ds = lho + 30 + buf.readUInt16LE(lho + 26) + ml;
      const csz = buf.readUInt32LE(o + 20), cp = buf.readUInt16LE(o + 10);
      const xml = (cp === 8 ? zlib.inflateRawSync(buf.subarray(ds, ds + csz)) : buf.subarray(ds, ds + csz)).toString("utf8");
      // Split on the paragraph tag, then drop the tag's own attributes (the
      // split consumes the opening "<w:p", leaving attrs outside any <...>).
      return xml.split(/<w:p[ >]/).slice(1)
        .map(p => p.replace(/^[^>]*>/, "").replace(/<[^>]+>/g, "").trim())
        .filter(Boolean);
    }
    o += 46 + cl + el + fl;
  }
  return [];
}

const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, note = "") => results.push([name, ok, note]);

async function main() {
  mkdirSync("Downloads/punchlist-0630", { recursive: true });
  const doc = await generateDocument(await mapFormToDocgenAnswers(formData() as any) as any);
  writeFileSync("Downloads/punchlist-0630/PF275_LLC_Operating_Agreement.docx", doc.buffer);
  const paras = paragraphs(doc.buffer);
  const text = paras.join("\n");

  // #7/#8 numbering: every x.y label appears once, and y runs 1..n with no gap.
  const secs = new Map<number, number[]>();
  for (const p of paras) {
    // A section label, not a decimal: "12.9 Drag-Along" but never "33.33%".
    const m = /^(\d{1,2})\.(\d{1,2})\s+[A-Z]/.exec(p);
    if (m) { const a = +m[1], b = +m[2]; if (!secs.has(a)) secs.set(a, []); secs.get(a)!.push(b); }
  }
  const dupes: string[] = [], gaps: string[] = [];
  for (const [a, list] of [...secs].sort((x, y) => x[0] - y[0])) {
    const seen = new Set<number>();
    for (const b of list) { if (seen.has(b)) dupes.push(`${a}.${b}`); seen.add(b); }
    const sorted = [...seen].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) gaps.push(`${a}.${sorted[i - 1]}→${a}.${sorted[i]}`);
  }
  check("#7 no duplicate section numbers", dupes.length === 0, dupes.join(", "));
  check("#8 no gaps in section numbering", gaps.length === 0, gaps.join(", "));

  // #4 drag/tag off => no orphan header and no body text either.
  check("#4 drag/tag absent entirely (toggle off)", !/drag.?along|tag.?along/i.test(text));

  // #5 signature block: one line per member, and NOT the single-member page.
  const sigIdx = paras.findIndex(p => /signature|in witness whereof/i.test(p));
  const tail = sigIdx >= 0 ? paras.slice(sigIdx).join("\n") : "";
  check("#5 signature block present", sigIdx >= 0);
  check("#5 all three members in signature block", OWNERS.every(o => tail.includes(o.fullName)), tail ? "" : "no sig block found");
  check("#5 not the single-member signature page", !/sole member/i.test(tail));

  // #10 the decimal split survives verbatim.
  for (const o of OWNERS) check(`#10 ${o.fullName} ${o.ownership}%`, text.includes(`${o.ownership}%`), "");

  // #11 banking clause must not assume two of two when there are three members.
  const bank = paras.filter(p => /bank|signator/i.test(p)).join(" ");
  check("#11 banking clause says member-or-manager, not 'either of the two'", !/either of the two|both members/i.test(bank), bank.slice(0, 120));

  // #12 no phantom state; governing law follows state_of_formation.
  check("#12 no 'state of flow' artifact", !/state of flow/i.test(text));
  check("#12 governing law = Florida", /laws of the State of Florida/i.test(text));

  // #13 sub-items use "i." not "(i)".
  const parenRoman = paras.filter(p => /^\((i|ii|iii|iv|v)\)/.test(p));
  check("#13 no '(i)' parenthesized sub-items", parenRoman.length === 0, parenRoman.slice(0, 3).join(" | "));

  // #6 "unanimous" must never stand alone as a bare adjective.
  const bare = paras.filter(p => /\bUnanimous\s*(?:$|[.,;])/i.test(p));
  check("#6 no bare 'Unanimous' without a noun", bare.length === 0, bare.slice(0, 2).join(" | "));

  // #14 member names render exactly as entered.
  for (const o of OWNERS) check(`#14 "${o.fullName}" renders exactly`, text.includes(o.fullName));

  // #12b a non-Florida formation must not leak Florida.
  const doc2 = await generateDocument(await mapFormToDocgenAnswers(formData("Texas") as any) as any);
  const t2 = paragraphs(doc2.buffer).join("\n");
  check("#12b Texas formation => Texas governing law", /laws of the State of Texas/i.test(t2) && !/laws of the State of Florida/i.test(t2));

  const fails = results.filter(r => !r[1]);
  for (const [n, ok, note] of results) console.log(` ${ok ? "✓" : "✗ FAIL"}  ${n}${note ? `  (${note})` : ""}`);
  console.log(`\n##### ${results.length - fails.length}/${results.length} pass — ${fails.length} FAILURES #####`);
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
