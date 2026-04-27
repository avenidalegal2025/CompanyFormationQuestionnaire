/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Verifies the Corp §4.2 capital table has <w:tcBorders> on every row
 * for 4/5/6 owner Corps (regression test for table-border-inheritance fix).
 * Generates the DOCX in-process via generateDocument(), unzips word/document.xml,
 * locates the §4.2 table, and asserts each <w:tr> has <w:tcBorders>.
 */
import { generateDocument } from "../src/lib/agreement-docgen";
import PizZip from "pizzip";

import type { QuestionnaireAnswers, Owner } from "../src/lib/agreement-docgen";

const NAMES = ["Roberto Test", "Ana Probes", "Carlos Veri", "Maria Quattro", "Pedro Cinco", "Sofia Seis"];

function buildAnswers(ownerCount: number): QuestionnaireAnswers {
  const owners: Owner[] = [];
  const each = Math.floor(100 / ownerCount * 100) / 100;
  for (let i = 0; i < ownerCount; i++) {
    owners.push({
      full_name: NAMES[i],
      shares_or_percentage: i === ownerCount - 1 ? 100 - each * (ownerCount - 1) : each,
      capital_contribution: 50000,
    } as Owner);
  }

  return {
    entity_type: "CORP",
    entity_name: `BorderTest${ownerCount}Inc`,
    state_of_formation: "Delaware",
    date_of_formation: "2026-01-01",
    principal_address: "100 Main St, Miami, FL 33181",
    county: "Miami-Dade",
    business_purpose: "general business",
    owners_list: owners,
    total_authorized_shares: 1000,
    par_value: 0.01,
    directors_managers: owners.slice(0, 2).map((o) => ({ name: o.full_name } as never)),
    officers: [{ name: NAMES[0], title: "President" } as never],
    tax_matters_partner: NAMES[0],
    additional_capital_voting: "majority",
    shareholder_loans_voting: "majority",
    distribution_frequency: "annual",
    majority_threshold: 51,
    supermajority_threshold: 75,
    sale_of_company_voting: "majority",
    major_decisions_voting: "majority",
    major_spending_threshold: 25000,
    bank_signees: "one",
    new_member_admission_voting: "majority",
    dissolution_voting: "majority",
    officer_removal_voting: "majority",
    family_transfer: "allowed",
    right_of_first_refusal: true,
    rofr_offer_period: 180,
    death_incapacity_forced_sale: false,
    drag_along: true,
    tag_along: true,
    include_noncompete: false,
    include_nonsolicitation: false,
    include_confidentiality: true,
  };
}

function unzipDocxXml(buf: Buffer): string {
  const zip = new PizZip(buf);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("word/document.xml not found");
  return file.asText();
}

function extractCapitalTable(xml: string): string {
  const anchorIdx = xml.indexOf("Number of Shares");
  if (anchorIdx < 0) throw new Error("§4.2 table anchor not found");
  const tblStart = xml.lastIndexOf("<w:tbl>", anchorIdx);
  const tblEnd = xml.indexOf("</w:tbl>", anchorIdx) + "</w:tbl>".length;
  return xml.substring(tblStart, tblEnd);
}

function rowTextContents(row: string): string[] {
  const matches = [...row.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
  return matches.map((m) => m[1]);
}

function checkVariant(ownerCount: number) {
  const answers = buildAnswers(ownerCount);
  return generateDocument(answers).then((res) => {
    const xml = unzipDocxXml(res.buffer);
    const tbl = extractCapitalTable(xml);
    const rows = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    const dataRows = rows.slice(1); // first row is header
    const ownerRows = dataRows.filter((r) => /\$[\d,]+/.test(r) || /[\d.]+%/.test(r));
    const withBorders = ownerRows.filter((r) => /<w:tcBorders\b/.test(r));
    const issues: string[] = [];
    const expectedNames = answers.owners_list.map((o) => o.full_name);

    ownerRows.forEach((r, idx) => {
      const texts = rowTextContents(r);
      // Each row should have 4 text runs: name, shares, $contribution, pct%
      if (texts.length !== 4) {
        issues.push(`row ${idx}: expected 4 text runs, got ${texts.length}: ${JSON.stringify(texts)}`);
        return;
      }
      const [nameTxt, sharesTxt, contribTxt, pctTxt] = texts;
      if (idx < expectedNames.length && nameTxt !== expectedNames[idx]) {
        issues.push(`row ${idx}: expected name "${expectedNames[idx]}", got "${nameTxt}"`);
      }
      if (!/^\d{1,3}(?:,\d{3})*$/.test(sharesTxt)) issues.push(`row ${idx}: shares not numeric: "${sharesTxt}"`);
      if (!/^\$\d/.test(contribTxt)) issues.push(`row ${idx}: contribution not $-prefixed: "${contribTxt}"`);
      if (!/%$/.test(pctTxt)) issues.push(`row ${idx}: pct not %-suffixed: "${pctTxt}"`);
    });

    return {
      ownerCount,
      ownerRows: ownerRows.length,
      borderedOwnerRows: withBorders.length,
      allBordered: withBorders.length === ownerRows.length,
      rowCountOk: ownerRows.length === Math.max(3, ownerCount), // template always has ≥3 rows
      issues,
    };
  });
}

async function main() {
  const results = [];
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const r = await checkVariant(n);
    results.push(r);
    const ok = r.allBordered && r.issues.length === 0;
    console.log(`${n}-owner: ownerRows=${r.ownerRows} bordered=${r.borderedOwnerRows} issues=${r.issues.length} ${ok ? "PASS" : "FAIL"}`);
    if (r.issues.length > 0) r.issues.forEach((i) => console.log("  -", i));
  }
  const failed = results.filter((r) => !r.allBordered || r.issues.length > 0);
  if (failed.length > 0) {
    console.error("FAIL:", failed.length, "variant(s)");
    process.exit(1);
  }
  console.log("ALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
