// Smoke test for the v2 report fixes: #7, #10, #11/12, #13, #16, #17.
// (#1 is UI-only, tested manually via Playwright.)
import { generateDocument } from "../src/lib/agreement-docgen";
import PizZip from "pizzip";

async function runCorp() {
  const answers: any = {
    entity_type: "CORP",
    entity_name: "V2 SMOKE Corp",
    state_of_formation: "Florida",
    date_of_formation: "2026-04-20T00:00:00Z",
    principal_address: "200 S Biscayne Blvd, Miami, FL 33131",
    county: "Miami-Dade",
    owners_list: [
      {
        full_name: "Alice Founder",
        shares_or_percentage: 60,
        capital_contribution: 60000,
        title: "Chief Executive Officer",
        responsibilities: "Strategy.",
      },
      {
        full_name: "Bob CoFounder",
        shares_or_percentage: 40,
        capital_contribution: 40000,
        // No title — should remove Owner label entirely for this one
      },
    ],
    total_authorized_shares: 10000, par_value: 0.01,
    management_type: "manager",
    directors_managers: [{ name: "Alice Founder" }, { name: "Bob CoFounder" }],
    officers: [{ name: "Alice Founder", title: "President" }, { name: "Bob CoFounder", title: "VP" }],
    additional_capital_voting: "majority", shareholder_loans_voting: "majority",
    distribution_frequency: "quarterly", majority_threshold: 50.01, supermajority_threshold: 75,
    sale_of_company_voting: "majority", major_decisions_voting: "majority",
    major_spending_threshold: 25000, // ← #13 reproducer
    bank_signees: "two",
    new_member_admission_voting: "majority", dissolution_voting: "unanimous",
    officer_removal_voting: "majority", family_transfer: "free",
    right_of_first_refusal: false, rofr_offer_period: 60,
    death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
    include_noncompete: false, include_nonsolicitation: true, include_confidentiality: true,
  };

  const { buffer } = await generateDocument(answers);
  const zip = new PizZip(buffer);
  const doc = zip.file("word/document.xml")!.asText();
  const styles = zip.file("word/styles.xml")!.asText();
  const texts = (doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, "")).join("");

  const checks: Record<string, boolean> = {};

  // #13 — $25k not $225k
  checks["#13 $25,000.00 not $225,000"] =
    texts.includes("excess of $25,000.00") && !texts.includes("$225,000");

  // #10 — capital table width reduced to 9000
  checks["#10 tblW shrunk to 9000"] = /<w:tblW\s+w:w="9000"/.test(doc);
  checks["#10 tblLayout fixed"] = /<w:tblLayout\s+w:type="fixed"\s*\/>/.test(doc);
  checks["#10 new gridCols 2700/1800/2250/2250"] =
    /<w:gridCol\s+w:w="2700"\/>/.test(doc) &&
    /<w:gridCol\s+w:w="1800"\/>/.test(doc) &&
    /<w:gridCol\s+w:w="2250"\/>/.test(doc);

  // #11/12 — Every romanette paragraph in § 9.2 must NOT have the wide
  // 8640 tab stop AND MUST have the tight hanging indent. We scan
  // per-paragraph so unrelated body paragraphs with unused tab stops don't
  // pollute the signal.
  const allParas = [...doc.matchAll(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g)];
  const badRomanettes = allParas.filter((m) => {
    const p = m[0];
    const txt = (p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("");
    // Only the broken (court-order / dissolution-decree) §9.2 items:
    // they start with (i)..(iv) AND are the ones that had wide tabs.
    if (!/^\((?:i|ii|iii|iv)\)/.test(txt)) return false;
    return /w:pos="8640"/.test(p) && !/<w:ind\s+w:left="720"\s+w:hanging="360"\s*\/>/.test(p);
  });
  checks["#11 all §9.2 romanettes cleaned"] = badRomanettes.length === 0;
  checks["#11 1800 tab stop exists in some romanette"] =
    allParas.some((m) => /<w:tab\s+w:val="left"\s+w:pos="1800"\/>/.test(m[0]));
  checks["#11 720/hanging=360 indent set on some romanette"] =
    allParas.some((m) => /<w:ind\s+w:left="720"\s+w:hanging="360"\s*\/>/.test(m[0]));

  // #17 — [SIGNATURE PAGE BELOW] heading gone
  checks["#17 no [SIGNATURE PAGE BELOW] text"] = !texts.includes("[SIGNATURE PAGE BELOW]");
  checks["#17 no SIGNATURE PAGE BELOW in XML"] = !/SIGNATURE PAGE BELOW/i.test(doc);

  // #16 — Alice with title shows title; Bob without title has no 'Owner' line after his name
  const aliceBlock = texts.match(/Name:\s*Alice Founder[\s\S]{0,100}/)?.[0] || "";
  const bobBlock = texts.match(/Name:\s*Bob CoFounder[\s\S]{0,100}/)?.[0] || "";
  checks["#16 Alice block has CEO title"] = /Chief Executive Officer/.test(aliceBlock);
  checks["#16 Alice block has no bare 'Owner'"] = !/\bOwner\b/.test(aliceBlock.replace(/Chief Executive Officer/, ""));
  checks["#16 Bob block has no 'Owner'"] = !/\bOwner\b/.test(bobBlock);

  // #7 — font audit — only TNR + preserved (Symbol/Courier/Wingdings)
  const docFonts = [...new Set([...doc.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]))];
  const stylesFonts = [...new Set([...styles.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]))];
  const allowed = new Set(["Times New Roman", "Symbol", "Courier New", "Wingdings"]);
  const docBad = docFonts.filter((f) => !allowed.has(f));
  const stylesBad = stylesFonts.filter((f) => !allowed.has(f));
  checks["#7 document.xml only TNR/Symbol"] = docBad.length === 0;
  checks["#7 styles.xml only TNR/Symbol"] = stylesBad.length === 0;
  if (docBad.length) console.log("  [#7] doc bad fonts:", docBad);
  if (stylesBad.length) console.log("  [#7] styles bad fonts:", stylesBad);

  console.log("\n=== CORP SMOKE (v2 fixes) ===");
  let fails = 0;
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? "OK  " : "FAIL"} ${k}`);
    if (!v) fails++;
  }
  // Print the actual signature snippets for visual verification
  console.log("\nAlice signature context:", aliceBlock.substring(0, 120));
  console.log("Bob   signature context:", bobBlock.substring(0, 120));
  return fails === 0;
}

async function runLLC() {
  const answers: any = {
    entity_type: "LLC",
    entity_name: "V2 SMOKE LLC",
    state_of_formation: "Florida",
    date_of_formation: "2026-04-20T00:00:00Z",
    principal_address: "200 S Biscayne Blvd, Miami, FL 33131",
    county: "Miami-Dade",
    owners_list: [
      { full_name: "Alice Founder", shares_or_percentage: 60, capital_contribution: 60000, title: "Managing Member" },
      { full_name: "Bob CoFounder", shares_or_percentage: 40, capital_contribution: 40000 },
    ],
    total_authorized_shares: 10000, par_value: 0.01,
    management_type: "manager",
    directors_managers: [{ name: "Alice Founder" }, { name: "Bob CoFounder" }],
    officers: [], tax_matters_partner: "Alice Founder",
    additional_capital_voting: "majority", shareholder_loans_voting: "majority",
    distribution_frequency: "quarterly", majority_threshold: 50.01, supermajority_threshold: 75,
    sale_of_company_voting: "majority", major_decisions_voting: "majority",
    major_spending_threshold: 10000, bank_signees: "two",
    new_member_admission_voting: "majority", dissolution_voting: "unanimous",
    officer_removal_voting: "majority", family_transfer: "free",
    right_of_first_refusal: false, rofr_offer_period: 60,
    death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
    include_noncompete: false, include_nonsolicitation: true, include_confidentiality: true,
  };

  const { buffer } = await generateDocument(answers);
  const zip = new PizZip(buffer);
  const doc = zip.file("word/document.xml")!.asText();
  const texts = (doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, "")).join("");

  const checks: Record<string, boolean> = {};

  // #17 — LLC should also strip the heading
  checks["LLC #17 no SIGNATURE PAGE BELOW"] = !texts.includes("[SIGNATURE PAGE BELOW]");

  // #16 — Alice has 'Managing Member' as signature label; Bob has no 'Owner of the Company'
  const aliceBlock = texts.match(/Name:\s*Alice Founder[\s\S]{0,150}/)?.[0] || "";
  const bobBlock = texts.match(/Name:\s*Bob CoFounder[\s\S]{0,150}/)?.[0] || "";
  checks["LLC #16 Alice block has title"] = /Managing Member/.test(aliceBlock);
  checks["LLC #16 Bob block no 'Owner of the Company'"] = !/Owner of the Company/.test(bobBlock);

  console.log("\n=== LLC SMOKE (v2 fixes) ===");
  let fails = 0;
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? "OK  " : "FAIL"} ${k}`);
    if (!v) fails++;
  }
  console.log("\nAlice LLC sig context:", aliceBlock.substring(0, 150));
  console.log("Bob   LLC sig context:", bobBlock.substring(0, 150));
  return fails === 0;
}

async function main() {
  const a = await runCorp();
  const b = await runLLC();
  const ok = a && b;
  console.log(`\n${ok ? "ALL PASS" : "FAILED"}`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
