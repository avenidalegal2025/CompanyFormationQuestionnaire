/**
 * Regression guard: DECIMAL ownership percentages must render verbatim.
 *
 * 2026-06-30 client review (Antonio Regojo): a 33.33/33.33/33.34 LLC rendered
 * its membership table as 33.1/33.1/33.3, and a 48.97% stake rendered as
 * 48.1% — stakes no longer summed to 100% in a binding operating agreement.
 *
 * Cause: renumberSectionsToCloseGaps() classified any paragraph starting with
 * "N.M" as a section heading. The members-table cell "33.33% of the MPI"
 * matched, so the pass read it as Article 33 §33, saw a one-section article
 * with a gap, and renumbered the owner's STAKE to "33.1".
 *
 * Integer percentages never tripped it, which is why the 480-variant matrix
 * (integer-only owner splits) stayed green throughout. Keep decimals here.
 */
import zlib from "node:zlib";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

const NAMES = ["Roberto Mendez", "Ana Garcia", "Carlos Lopez"];

function docText(buf: Buffer): string {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let o = buf.readUInt32LE(eocd + 16);
  while (buf.readUInt32LE(o) === 0x02014b50) {
    const cl = buf.readUInt16LE(o + 28), el = buf.readUInt16LE(o + 30), fl = buf.readUInt16LE(o + 32);
    const lho = buf.readUInt32LE(o + 42);
    const nm = buf.toString("utf8", o + 46, o + 46 + cl);
    const ml = buf.readUInt16LE(lho + 28);
    const ds = lho + 30 + buf.readUInt16LE(lho + 26) + ml;
    const csz = buf.readUInt32LE(o + 20), cp = buf.readUInt16LE(o + 10);
    if (nm === "word/document.xml")
      return (cp === 8 ? zlib.inflateRawSync(buf.subarray(ds, ds + csz)) : buf.subarray(ds, ds + csz))
        .toString("utf8").replace(/<[^>]+>/g, "");
    o += 46 + cl + el + fl;
  }
  return "";
}

function formData(pcts: number[]) {
  const owners = pcts.map((p, i) => ({
    fullName: NAMES[i], firstName: NAMES[i].split(" ")[0],
    lastName: NAMES[i].split(" ").slice(1).join(" "),
    ownership: p, ownershipPercentage: p, ownerType: "persona", isUsCitizen: "No",
  }));
  const agreement: any = {
    wants: "Yes", majorityThreshold: 50.01, supermajorityThreshold: 75,
    distributionFrequency: "Trimestral",
    llc_companySaleDecision: "Mayoría", llc_bankSigners: "Dos firmantes",
    llc_majorDecisions: "Mayoría", llc_majorSpendingThreshold: "15000",
    llc_officerRemovalVoting: "Mayoría", llc_nonCompete: "No",
    llc_nonSolicitation: "No", llc_confidentiality: "Yes", llc_nonDisparagement: "Yes",
    llc_taxPartner: NAMES[0], llc_minTaxDistribution: 30, llc_rofr: "No",
    llc_rofrOfferPeriod: 180, llc_tagDragRights: "No", llc_incapacityHeirsPolicy: "Yes",
    llc_dissolutionDecision: "Mayoría", llc_newMembersAdmission: "Mayoría",
    llc_newPartnersAdmission: "Mayoría", llc_managingMembers: "Yes",
    llc_additionalContributions: "Sí, Pro-Rata", llc_additionalContributionsDecision: "Mayoría",
    llc_memberLoans: "Yes", llc_memberLoansVoting: "Mayoría",
  };
  pcts.forEach((_, i) => { agreement[`llc_capitalContributions_${i}`] = "50000"; });
  return {
    company: { entityType: "LLC", companyName: "Probe LLC", companyNameBase: "Probe LLC",
      entitySuffix: "LLC", hasUsAddress: "No", hasUsPhone: "No", state: "Florida" },
    ownersCount: pcts.length,
    owners: Object.fromEntries(owners.map((o, i) => [String(i), o])),
    admin: { managersAllOwners: "Yes" },
    agreement,
  };
}

let failures = 0;

async function run(label: string, pcts: number[]) {
  const ans: any = await mapFormToDocgenAnswers(formData(pcts) as any);
  const t = docText((await generateDocument(ans)).buffer);
  console.log(`\n===== ${label} — input ${pcts.join(" / ")} =====`);
  for (let i = 0; i < pcts.length; i++) {
    const want = `${pcts[i]}% of the MPI`;
    const ok = t.includes(want);
    if (!ok) failures++;
    console.log(`  ${ok ? "✓" : "✗ MISSING"}  "${want}"  (${NAMES[i]})`);
  }
  const found = [...t.matchAll(/(\d+(?:\.\d+)?)\s*% of the MPI/g)].map(m => m[1]);
  console.log(`  rendered MPI percentages: ${JSON.stringify(found)}`);
  const sum = found.reduce((a, b) => a + parseFloat(b), 0);
  const sums = Math.abs(sum - 100) <= 0.005;
  if (!sums) failures++;
  console.log(`  sum = ${sum.toFixed(2)}%${sums ? "" : "   <-- DOES NOT SUM TO 100"}`);
  const odd = [...t.matchAll(/(\d+\.\d{3,})\s*%/g)].map(m => m[1]);
  if (odd.length) { failures++; console.log(`  long-decimal artifacts: ${JSON.stringify(odd)}`); }
}

(async () => {
  await run("A: thirds", [33.33, 33.33, 33.34]);
  await run("B: 48.97 case", [48.97, 51.03]);
  await run("C: integers (control)", [33, 33, 34]);
  console.log(
    failures === 0
      ? "\n✅ decimal ownership percentages render verbatim and sum to 100%."
      : `\n❌ ${failures} decimal-ownership failure(s).`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
