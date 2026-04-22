// Generate Corp + LLC DOCX locally, save them, validate XML depth of <w:p>.
import { generateDocument } from "../src/lib/agreement-docgen";
import PizZip from "pizzip";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.USERPROFILE || ".";

async function gen(label: string, answers: any) {
  const { buffer } = await generateDocument(answers);
  const out = join(HOME, "Downloads", `LOCAL_${label}.docx`);
  writeFileSync(out, buffer);
  console.log(`[${label}] wrote ${out} (${buffer.length} bytes)`);

  const zip = new PizZip(buffer);
  const doc = zip.file("word/document.xml")!.asText();

  // Count <w:p> depth
  const re = /<w:p(?:\s[^>]*)?(\/)?>|<\/w:p>/g;
  let depth = 0;
  let maxDepth = 0;
  let firstBreak = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    const tag = m[0];
    const selfClose = tag.endsWith("/>") && !tag.startsWith("</");
    const isClose = tag.startsWith("</w:p>");
    if (isClose) depth--;
    else if (!selfClose) {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    }
    if ((depth < 0 || depth > 1) && firstBreak < 0) firstBreak = m.index;
  }
  const opens = (doc.match(/<w:p[\s>]/g) || []).length;
  const closes = (doc.match(/<\/w:p>/g) || []).length;
  console.log(`[${label}] <w:p> open=${opens} close=${closes} diff=${opens - closes} maxDepth=${maxDepth} firstBreakAt=${firstBreak}`);
  if (firstBreak > 0) {
    console.log(`[${label}] context at break:`);
    console.log(doc.substring(Math.max(0, firstBreak - 250), firstBreak + 300).replace(/></g, ">\n<"));
  }
  return buffer;
}

const corpAnswers: any = {
  entity_type: "CORP",
  entity_name: "LO REPRO Corp",
  state_of_formation: "Florida",
  date_of_formation: "2026-04-21T00:00:00Z",
  principal_address: "200 S Biscayne Blvd, Miami, FL 33131",
  county: "Miami-Dade",
  owners_list: [
    { full_name: "Alice Founder", shares_or_percentage: 60, capital_contribution: 60000, title: "Chief Executive Officer", responsibilities: "Strategy." },
    { full_name: "Bob CoFounder", shares_or_percentage: 40, capital_contribution: 40000 },
  ],
  total_authorized_shares: 10000, par_value: 0.01,
  management_type: "manager",
  directors_managers: [{ name: "Alice Founder" }, { name: "Bob CoFounder" }],
  officers: [{ name: "Alice Founder", title: "President" }],
  additional_capital_voting: "majority", shareholder_loans_voting: "majority",
  distribution_frequency: "quarterly", majority_threshold: 50.01, supermajority_threshold: 75,
  sale_of_company_voting: "majority", major_decisions_voting: "majority",
  major_spending_threshold: 25000, bank_signees: "two",
  new_member_admission_voting: "majority", dissolution_voting: "unanimous",
  officer_removal_voting: "majority", family_transfer: "free",
  right_of_first_refusal: false, rofr_offer_period: 60,
  death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
  include_noncompete: false, include_nonsolicitation: true, include_confidentiality: true,
};

gen("CORP", corpAnswers).catch((e) => { console.error(e); process.exit(1); });
