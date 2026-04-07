import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────

export interface Owner {
  full_name: string;
  shares_or_percentage: number;
  capital_contribution: number;
}

export interface DirectorManager {
  name: string;
}

export interface Officer {
  name: string;
  title: string;
}

export interface QuestionnaireAnswers {
  entity_type: "CORP" | "LLC";
  entity_name: string;
  state_of_formation: string;
  date_of_formation: string;
  principal_address: string;
  county: string;
  business_purpose?: string;
  owners_list: Owner[];
  total_authorized_shares?: number;
  par_value?: number;
  management_type?: string; // "manager" | "member" (LLC only)
  directors_managers: DirectorManager[];
  officers: Officer[];
  tax_matters_partner?: string;
  additional_capital_voting: string;
  shareholder_loans_voting: string;
  distribution_frequency: string;
  min_tax_distribution?: number;
  majority_threshold: number;
  supermajority_threshold?: number;
  sale_of_company_voting: string;
  major_decisions_voting: string;
  major_spending_threshold: number;
  bank_signees: string; // "one" | "two"
  new_member_admission_voting: string;
  dissolution_voting: string;
  officer_removal_voting: string;
  family_transfer: string;
  right_of_first_refusal: boolean;
  rofr_offer_period?: number;
  death_incapacity_forced_sale: boolean;
  drag_along: boolean;
  tag_along: boolean;
  include_noncompete: boolean;
  noncompete_duration?: number;
  noncompete_scope?: string;
  include_nonsolicitation: boolean;
  include_confidentiality: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const day = d.getUTCDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
        ? "nd"
        : day === 3 || day === 23
          ? "rd"
          : "th";
  return `${months[d.getUTCMonth()]} ${day}${suffix}, ${d.getUTCFullYear()}`;
}

/** Corp template expects just "Month Day" (e.g., "March 24") — template adds "th, YYYY" */
function formatDateForCorpTemplate(isoDate: string): string {
  const d = new Date(isoDate);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function votingText(value: string): string {
  switch (value) {
    case "supermajority":
      return "Super Majority";
    case "unanimous":
      return "Unanimous";
    default:
      return "Majority";
  }
}

// ─── LLC Document Generation ──────────────────────────────────────────

function generateLLC(answers: QuestionnaireAnswers): Buffer {
  const templatePath = path.join(
    process.cwd(),
    "templates",
    "llc_template.docx"
  );
  const content = fs.readFileSync(templatePath);
  const zip = new PizZip(content);

  // Use docxtemplater with {{}} delimiters (matching the LLC template)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });

  const managedTypePlural =
    answers.management_type === "member" ? "Members" : "Managers";

  // Build template data matching the LLC template variables
  const data: Record<string, string> = {
    llc_name_text: answers.entity_name,
    full_state: answers.state_of_formation,
    Date_of_formation_LLC: formatDate(answers.date_of_formation),
    full_llc_address: answers.principal_address,
    full_county: answers.county,
    Managed_type_plural: managedTypePlural,
    "Tax Matters Manager_01": answers.tax_matters_partner || "",
    Manager_1: answers.directors_managers[0]?.name || "",
    Manager_2: answers.directors_managers[1]?.name || "",
  };

  // Map first 2 owners to the hardcoded member_01/member_02 slots
  for (let i = 0; i < Math.min(answers.owners_list.length, 2); i++) {
    const num = String(i + 1).padStart(2, "0");
    data[`member_${num}_full_name`] = answers.owners_list[i].full_name;
    data[`member_${num}_amount`] = formatCurrency(
      answers.owners_list[i].capital_contribution
    );
    data[`member_${num}_pct`] = `${answers.owners_list[i].shares_or_percentage}`;
  }

  // Fix preamble for 3+ owners: "by A and B" → "by A, B, and C"
  if (answers.owners_list.length > 2) {
    const allNames = answers.owners_list.map((o) => o.full_name);
    const preambleNames =
      allNames.slice(0, -1).join(", ") + ", and " + allNames[allNames.length - 1];
    data["member_01_full_name"] = preambleNames;
    data["member_02_full_name"] = ""; // Clear the "and member_02" — it's now in member_01
  }

  doc.render(data);

  // Get the rendered XML for post-processing
  const renderedZip = doc.getZip();
  let xml = renderedZip.file("word/document.xml")!.asText();

  // For 3+ owners: duplicate capital contribution, MPI, and signature blocks
  if (answers.owners_list.length > 2) {
    xml = addExtraLLCMembers(xml, answers);
  }

  // Post-processing: voting text, bank accounts, conditional sections
  xml = applyLLCVotingReplacements(xml, answers);
  xml = applyLLCBankAccountText(xml, answers);
  xml = removeLLCConditionalSections(xml, answers);

  renderedZip.file("word/document.xml", xml);

  return Buffer.from(
    renderedZip.generate({
      type: "nodebuffer",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  );
}

// ─── LLC Extra Members (3-6 owners) ──────────────────────────────────

/**
 * For LLCs with 3+ members, the template only has member_01 and member_02.
 * This function adds extra member lines to:
 * 1. Capital contributions (Sec 5.1) — add rows after member_02's amount
 * 2. MPI percentages (Sec 7.4) — add rows after member_02's percentage
 * 3. Signature blocks — add "By:" / "Name:" / "% Owner" blocks
 */
function addExtraLLCMembers(
  xml: string,
  answers: QuestionnaireAnswers
): string {
  const extraOwners = answers.owners_list.slice(2); // members 3, 4, 5, 6

  // Build text lines for capital contributions (Sec 5.1)
  for (const owner of extraOwners) {
    const line = `${owner.full_name}           $${formatCurrency(owner.capital_contribution)}`;
    // Insert after the last capital contribution line (member_02's amount)
    const member02Amount = formatCurrency(answers.owners_list[1]?.capital_contribution || 0);
    const searchText = `$${member02Amount}`;
    xml = xmlTextReplace(
      xml,
      searchText,
      `${searchText}</w:t></w:r></w:p><w:p><w:r><w:t>${line}`,
      false
    );
  }

  // Build text lines for MPI percentages (Sec 7.4)
  for (const owner of extraOwners) {
    const line = `${owner.full_name}           ${owner.shares_or_percentage}%`;
    // Insert after member_02's percentage
    const member02Pct = `${answers.owners_list[1]?.shares_or_percentage || 0}%`;
    xml = xmlTextReplace(
      xml,
      member02Pct,
      `${member02Pct}</w:t></w:r></w:p><w:p><w:r><w:t>${line}`,
      false
    );
  }

  // Build signature blocks for extra members
  // Find the last "% Owner of the Company" signature block and add more after it
  const lastMember2Sig = `${answers.owners_list[1]?.shares_or_percentage || 0}% Owner of the Company`;
  const extraSigBlocks = extraOwners
    .map(
      (owner) =>
        `</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>By: __________________________</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Name: ${owner.full_name}</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>${owner.shares_or_percentage}% Owner of the Company`
    )
    .join("");

  xml = xmlTextReplace(
    xml,
    lastMember2Sig,
    lastMember2Sig + extraSigBlocks,
    false
  );

  // Also add extra managers if needed
  if (answers.directors_managers.length > 2) {
    const extraManagers = answers.directors_managers.slice(2);
    const manager2Name = answers.directors_managers[1]?.name || "";
    if (manager2Name) {
      const extraManagerText = extraManagers
        .map((m) => ` and ${m.name}`)
        .join("");
      xml = xmlTextReplace(
        xml,
        manager2Name + " to serve as the Managers",
        manager2Name + extraManagerText + " to serve as the Managers",
        false
      );
    }
  }

  return xml;
}

// ─── LLC Voting Replacements ─────────────────────────────────────────

function applyLLCVotingReplacements(
  xml: string,
  answers: QuestionnaireAnswers
): string {
  // Each replacement targets specific text in specific sections.
  // We find the exact phrase and replace "Majority" with the chosen option.
  //
  // LLC voting locations (from template analysis):
  //
  // Sec 5.1 (additional capital): "agreed by Majority to the incurrence"
  // Sec 6.1 (loans): "Majority consent of the Members"
  // Sec 8 (sale of assets): "acceptance by the Members shall require a Majority"
  // Sec 11.4(i) (major decisions): "Majority Approval of the Members"
  // Sec 12.5/12.3 (withdrawal): "Majority vote or consent"
  // Sec 13.1 (new members): appears in section 13
  // Sec 14.6 (removal): in section 14
  // Sec 15.1 (dissolution): "Majority election of the Members"
  // Sec 19.7 (majority definition): defines the threshold percentage

  const replacements: Array<{
    find: string;
    replace: string;
    votingKey: keyof QuestionnaireAnswers;
  }> = [
    // Sec 5.1 - Additional capital
    {
      find: "agreed by Majority to the incurrence",
      replace: `agreed by ${votingText(answers.additional_capital_voting)} to the incurrence`,
      votingKey: "additional_capital_voting",
    },
    // Sec 6.1 - Shareholder loans
    {
      find: "Majority consent of the Members",
      replace: `${votingText(answers.shareholder_loans_voting)} consent of the Members`,
      votingKey: "shareholder_loans_voting",
    },
    // Sec 8 / 10.3 - Sale of company/assets
    {
      find: "requires the Majority consent of the Members",
      replace: `requires the ${votingText(answers.sale_of_company_voting)} consent of the Members`,
      votingKey: "sale_of_company_voting",
    },
    // Sec 11.4(i) - Major decisions
    {
      find: "Majority Approval of the Members",
      replace: `${votingText(answers.major_decisions_voting)} Approval of the Members`,
      votingKey: "major_decisions_voting",
    },
    // Sec 13 - New member admission
    {
      find: "Subject to the limitations in this Agreement, the Company may admit new Members",
      replace: `Subject to the limitations in this Agreement, the Company may admit new Members`,
      votingKey: "new_member_admission_voting",
    },
    // Sec 14.6 - Officer/member removal
    {
      find: "any Member of the Company may be removed for cause",
      replace: "any Member of the Company may be removed for cause",
      votingKey: "officer_removal_voting",
    },
    // Sec 15.1 - Dissolution
    {
      find: "Majority election of the Members to dissolve",
      replace: `${votingText(answers.dissolution_voting)} election of the Members to dissolve`,
      votingKey: "dissolution_voting",
    },
    // Sec 11.1C - Manager removal
    {
      find: "Majority vote of the Members excluding",
      replace: `${votingText(answers.officer_removal_voting)} vote of the Members excluding`,
      votingKey: "officer_removal_voting",
    },
  ];

  for (const r of replacements) {
    // Escape for XML context - the text might contain XML entities
    xml = xmlTextReplace(xml, r.find, r.replace);
  }

  // Replace majority threshold percentage in Sec 19.7
  if (answers.majority_threshold && answers.majority_threshold !== 50) {
    xml = xmlTextReplace(xml, "50.1%", `${answers.majority_threshold}.1%`);
  }

  // Replace spending threshold in Sec 11.4
  if (answers.major_spending_threshold) {
    const threshold = formatCurrency(answers.major_spending_threshold);
    // The LLC template has $5,000.00 in multiple sub-items of Sec 11.4
    xml = xmlTextReplace(xml, "$5,000.00", `$${threshold}`, true);
  }

  return xml;
}

// ─── LLC Bank Account Text ───────────────────────────────────────────

function applyLLCBankAccountText(
  xml: string,
  answers: QuestionnaireAnswers
): string {
  if (answers.bank_signees === "two") {
    xml = xmlTextReplace(
      xml,
      "the signature of any Member or Manager of the Company",
      "the signature of any two Members or Managers of the Company"
    );
  }
  return xml;
}

// ─── LLC Conditional Section Removal ─────────────────────────────────

function removeLLCConditionalSections(
  xml: string,
  answers: QuestionnaireAnswers
): string {
  // ROFR = No → Remove section 12.1 (Right of First Refusal) and sub-paragraphs
  if (!answers.right_of_first_refusal) {
    xml = removeXmlParagraphsContaining(xml, [
      "12.1Right of First Refusal",
      "12.1 Right of First Refusal",
      "Right of First Refusal.",
      "Offer.  Subject to Section 12",
      "Concurrence or Acceptance.  The Offerees",
      "Rights of Buyer.  A purchaser of the Selling Member",
    ]);
  }

  // Drag-Along = No → Remove drag-along sub-paragraph
  if (!answers.drag_along) {
    xml = removeXmlParagraphsContaining(xml, [
      "Drag Along",
    ]);
  }

  // Tag-Along = No → Remove tag-along sub-paragraph
  if (!answers.tag_along) {
    xml = removeXmlParagraphsContaining(xml, [
      "Tag Along",
    ]);
  }

  // Non-compete: The LLC template doesn't have a standalone non-compete
  // section (SDD notes it's in Sec 11.11 but the actual template has
  // "Intellectual Property" at 11.11, not non-compete).
  // Non-compete would need to be added if needed.

  // Non-disparagement removal is not needed (always included per template)

  return xml;
}

// ─── Corp Document Generation ─────────────────────────────────────────

function generateCorp(answers: QuestionnaireAnswers): Buffer {
  const templatePath = path.join(
    process.cwd(),
    "templates",
    "corp_template.docx"
  );
  const content = fs.readFileSync(templatePath);
  const zip = new PizZip(content);

  // ── 1. Use docxtemplater for {{}} variable replacement ──
  const totalShares = answers.total_authorized_shares || 1000;
  const directors = answers.directors_managers.map((d) => d.name);

  // Build shareholder data for template variables
  const shareholderData: Record<string, string> = {};
  answers.owners_list.forEach((owner, i) => {
    const idx = i + 1;
    // owner.shares_or_percentage is the ownership %; calculate actual shares
    const pct = owner.shares_or_percentage;
    const shares = Math.round((pct / 100) * totalShares);
    const actualPct = ((shares / totalShares) * 100).toFixed(2);
    shareholderData[`shareholder_${idx}_name`] = owner.full_name;
    shareholderData[`shareholder_${idx}_shares`] = shares.toLocaleString();
    shareholderData[`shareholder_${idx}_contribution`] = formatCurrency(owner.capital_contribution);
    shareholderData[`shareholder_${idx}_pct`] = actualPct;
  });

  const bankSigneesText = answers.bank_signees === "two" ? "two" : "one";
  const majorityPct = answers.majority_threshold || 50;
  const majorityText = `${numberToWords(majorityPct).toUpperCase()} PERCENT (${majorityPct.toFixed(2)}%)`;

  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });

  doc.render({
    corp_name: answers.entity_name.toUpperCase(),
    corp_name_short: answers.entity_name.replace(/\s+(Inc\.|LLC|Corp\.?)$/i, "").toUpperCase(),
    effective_date: formatDateForCorpTemplate(answers.date_of_formation),
    principal_address: answers.principal_address,
    county: answers.county,
    state: answers.state_of_formation,
    total_authorized_shares: totalShares.toLocaleString(),
    par_value: (answers.par_value ?? 0.01).toFixed(2),
    major_spending_threshold: formatCurrency(answers.major_spending_threshold),
    bank_signees_text: bankSigneesText,
    majority_threshold_text: majorityText,
    rofr_period: String(answers.rofr_offer_period ?? 180),
    directors: directors.join(", "),
    ...shareholderData,
  });

  // ── 2. Post-processing on rendered XML ──
  const renderedZip = doc.getZip();
  let xml = renderedZip.file("word/document.xml")!.asText();

  // For 4+ shareholders: add extra rows to capital table and signature block
  if (answers.owners_list.length > 3) {
    xml = addExtraCorpShareholders(xml, answers, totalShares);
  }

  // Voting text replacements
  xml = applyCorpVotingReplacements(xml, answers);

  // Bank account text (additional replacements beyond the template var)
  xml = applyCorpBankAccountText(xml, answers);

  // Conditional section removal
  xml = removeCorpConditionalSections(xml, answers);

  // Fix #27: Add Supermajority definition after Majority definition (1.6)
  // The template has "1.6 Majority" but no "1.11 Super Majority" definition.
  // Insert it by replacing the Majority definition text to include Supermajority.
  if (answers.supermajority_threshold) {
    const supPct = answers.supermajority_threshold;
    const supText = `${numberToWords(supPct).toUpperCase()} PERCENT (${supPct}%)`;
    // Add supermajority definition text after the majority definition paragraph
    xml = xmlTextReplace(
      xml,
      "eligible to vote.",
      `eligible to vote.  1.7 Super Majority. Shareholders collectively holding greater than ${supText} of the Percentage Interests of all the Shareholders eligible to vote.`,
      false
    );
  }

  // Fix #30: Replace hardcoded ownership percentages in signature section
  answers.owners_list.forEach((owner, i) => {
    const pct = owner.shares_or_percentage;
    const actualPct = ((Math.round((pct / 100) * totalShares) / totalShares) * 100).toFixed(2);
    const hardcodedPcts = ["75%", "12.5%", "12.5%"];
    if (i < hardcodedPcts.length) {
      // Replace only the first remaining occurrence
      xml = xmlTextReplace(xml, hardcodedPcts[i] + " Owner", actualPct + "% Owner", false);
    }
  });

  renderedZip.file("word/document.xml", xml);

  return Buffer.from(
    renderedZip.generate({
      type: "nodebuffer",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  );
}

// ─── Corp Extra Shareholders (4-6 owners) ───────────────────────────

/**
 * For Corps with 4+ shareholders, the template only has shareholder_1/2/3.
 * This adds extra rows to the capital contributions table and signature block.
 */
function addExtraCorpShareholders(
  xml: string,
  answers: QuestionnaireAnswers,
  totalShares: number
): string {
  const extraOwners = answers.owners_list.slice(3); // shareholders 4, 5, 6

  // Add extra rows to the capital contributions table (Sec 4.2)
  // Find shareholder_3's contribution and add after it
  const sh3 = answers.owners_list[2];
  if (sh3) {
    const sh3Pct = ((Math.round((sh3.shares_or_percentage / 100) * totalShares) / totalShares) * 100).toFixed(2);
    const searchPct = `${sh3Pct}%`;

    for (const owner of extraOwners) {
      const shares = Math.round((owner.shares_or_percentage / 100) * totalShares);
      const pct = ((shares / totalShares) * 100).toFixed(2);
      const row = `</w:t></w:r></w:p></w:tc></w:tr>` +
        `<w:tr><w:tc><w:p><w:r><w:t>${owner.full_name}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${shares.toLocaleString()}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>$${formatCurrency(owner.capital_contribution)}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${pct}%`;
      // Insert after the last cell of shareholder 3's row
      xml = xmlTextReplace(xml, searchPct, searchPct + row, false);
    }
  }

  // Add extra signature blocks
  // The template has hardcoded percentages that get replaced by fix #30
  // For 4+ owners, we need to add new "By:" / "Name:" blocks
  const lastSh3Name = answers.owners_list[2]?.full_name || "";
  if (lastSh3Name) {
    const extraSigs = extraOwners
      .map((owner) => {
        const pct = ((Math.round((owner.shares_or_percentage / 100) * totalShares) / totalShares) * 100).toFixed(2);
        return `</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>By: ______________________</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>Name:   ${owner.full_name}</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>${pct}% Owner`;
      })
      .join("");

    // Find the last signature block (shareholder 3's "Owner" line)
    // After fix #30 replaces percentages, look for shareholder 3's name in signature
    xml = xmlTextReplace(
      xml,
      `Name:   ${lastSh3Name}`,
      `Name:   ${lastSh3Name}`,
      false
    );
    // Actually insert after the "% Owner" line following shareholder 3
    const sh3Pct = ((Math.round((sh3.shares_or_percentage / 100) * totalShares) / totalShares) * 100).toFixed(2);
    xml = xmlTextReplace(
      xml,
      `12.5% Owner`,
      `${sh3Pct}% Owner` + extraSigs,
      false
    );
  }

  return xml;
}

// ─── Corp Voting Replacements ────────────────────────────────────────

function applyCorpVotingReplacements(
  xml: string,
  answers: QuestionnaireAnswers
): string {
  // Corp voting locations (from template analysis):
  //
  // Sec 3.2 (dissolution): "Majority election to dissolve by the Shareholders"
  // Sec 4.3 (new members): "approved by a Majority"
  // Sec 4.5 (additional capital): handled by context
  // Sec 7.3 (loans): "Majority consent"
  // Sec 9.1 (sale of corp): "Majority consent or approval of both"
  // Sec 10.1 (major decisions): "Majority affirmative vote of the Board"
  // Sec 10.7 (bank accounts): handled separately
  // Sec 12.1 (removal): "Majority vote of the Shareholders"

  const replacements: Array<{ find: string; replace: string }> = [
    // Sec 3.2 - Dissolution
    {
      find: "Majority election to dissolve by the Shareholders",
      replace: `${votingText(answers.dissolution_voting)} election to dissolve by the Shareholders`,
    },
    // Sec 4.3 - New shareholders
    {
      find: "approved by a Majority of the Shareholders",
      replace: `approved by a ${votingText(answers.new_member_admission_voting)} of the Shareholders`,
    },
    // Sec 7.3 - Shareholder loans ("explicit Majority" is unique to the loans clause)
    {
      find: "explicit Majority approval of the Board of Directors",
      replace: `explicit ${votingText(answers.shareholder_loans_voting)} approval of the Board of Directors`,
    },
    // Sec 9.1 / 10.2.e - Sale of corporation
    {
      find: "Majority consent or approval of both the Shareholders and the Board",
      replace: `${votingText(answers.sale_of_company_voting)} consent or approval of both the Shareholders and the Board`,
    },
    // Sec 10.1 - Major decisions
    {
      find: "Majority affirmative vote of the Board of Directors",
      replace: `${votingText(answers.major_decisions_voting)} affirmative vote of the Board of Directors`,
    },
    // Sec 10.1 - Major spending (Limitation on Officers)
    {
      find: "Majority consent of the Board of Directors",
      replace: `${votingText(answers.major_decisions_voting)} consent of the Board of Directors`,
    },
    // Sec 12.1 - Officer/Director removal
    {
      find: "Majority vote of the Shareholders at a meeting",
      replace: `${votingText(answers.officer_removal_voting)} vote of the Shareholders at a meeting`,
    },
  ];

  for (const r of replacements) {
    xml = xmlTextReplace(xml, r.find, r.replace);
  }

  // Major spending threshold
  if (answers.major_spending_threshold) {
    const threshold = formatCurrency(answers.major_spending_threshold);
    xml = xmlTextReplace(xml, "$5,000.00", `$${threshold}`);
    xml = xmlTextReplace(xml, "5,000.00", threshold);
  }

  return xml;
}

// ─── Corp Bank Account Text ──────────────────────────────────────────

function applyCorpBankAccountText(
  xml: string,
  answers: QuestionnaireAnswers
): string {
  if (answers.bank_signees === "two") {
    xml = xmlTextReplace(
      xml,
      "upon the signature of one of the Officers",
      "upon the signature of two of the Officers"
    );
    xml = xmlTextReplace(
      xml,
      "the signature of one of the Officers of the Corporation",
      "the signature of two of the Officers of the Corporation"
    );
  }
  return xml;
}

// ─── Corp Conditional Section Removal ────────────────────────────────

function removeCorpConditionalSections(
  xml: string,
  answers: QuestionnaireAnswers
): string {
  // ROFR = No → Remove Right of First Refusal section (Article XIII)
  if (!answers.right_of_first_refusal) {
    xml = removeXmlParagraphsContaining(xml, [
      "Right of First Refusal",
      "Offer.  Subject to Article 4.3",
      "The Transferor shall deliver a notice",
      "Concurrence or Acceptance.  The Offerees shall respond",
      "In the event that a Shareholder has elected to sell its Shares",
      "Purchase of Shareholder Interests upon Deadlock",
      "Bona Fide Offer",
    ]);
  }

  // Drag-Along = No
  if (!answers.drag_along) {
    xml = removeXmlParagraphsContaining(xml, ["Drag Along"]);
  }

  // Tag-Along = No
  if (!answers.tag_along) {
    xml = removeXmlParagraphsContaining(xml, ["Tag Along"]);
  }

  return xml;
}

// ─── XML Utility Functions ───────────────────────────────────────────

/**
 * Replace text within XML <w:t> elements, handling the fact that
 * the text we're looking for might span multiple <w:t> elements
 * within the same paragraph.
 */
function xmlTextReplace(
  xml: string,
  find: string,
  replace: string,
  replaceAll = false
): string {
  // Strategy: For each <w:p> paragraph, extract all text from <w:t> elements,
  // check if the concatenated text contains `find`, and if so, do the
  // replacement in the first <w:t> that starts the match and adjust subsequent ones.

  // Simple case: if the find text appears literally in the XML (not split across runs)
  if (xml.includes(find)) {
    if (replaceAll) {
      return xml.split(find).join(replace);
    }
    return xml.replace(find, replace);
  }

  // Complex case: text might be split across <w:t> elements.
  // We need to find paragraphs where the concatenated text matches.
  const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

  let result = xml;
  let match;

  // Find paragraphs that contain the text when concatenated
  while ((match = pRegex.exec(xml)) !== null) {
    const paragraph = match[0];
    let fullText = "";
    let tMatch;
    const tElements: Array<{ start: number; end: number; text: string }> = [];

    const localTRegex = new RegExp(tRegex.source, "g");
    while ((tMatch = localTRegex.exec(paragraph)) !== null) {
      tElements.push({
        start: tMatch.index,
        end: tMatch.index + tMatch[0].length,
        text: tMatch[1],
      });
      fullText += tMatch[1];
    }

    if (fullText.includes(find)) {
      // Found the text split across runs in this paragraph.
      // Replace in the concatenated text, then redistribute across <w:t> elements.
      const newFullText = replaceAll
        ? fullText.split(find).join(replace)
        : fullText.replace(find, replace);

      // Simple approach: put all text in the first <w:t>, clear the rest
      if (tElements.length > 0) {
        let newParagraph = paragraph;
        // Work backwards to preserve indices
        for (let i = tElements.length - 1; i >= 0; i--) {
          const el = tElements[i];
          const before = newParagraph.substring(0, el.start);
          const after = newParagraph.substring(el.end);
          if (i === 0) {
            // First <w:t>: put the new full text
            const newT = `<w:t xml:space="preserve">${newFullText}</w:t>`;
            newParagraph = before + newT + after;
          } else {
            // Subsequent <w:t>s: empty them
            const newT = `<w:t xml:space="preserve"></w:t>`;
            newParagraph = before + newT + after;
          }
        }
        result = result.replace(paragraph, newParagraph);
        if (!replaceAll) return result;
      }
    }
  }

  return result;
}

/**
 * Remove entire <w:p> paragraphs that contain any of the given text strings.
 */
function removeXmlParagraphsContaining(
  xml: string,
  textPatterns: string[]
): string {
  const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

  return xml.replace(pRegex, (paragraph) => {
    let fullText = "";
    let tMatch;
    const localTRegex = new RegExp(tRegex.source, "g");
    while ((tMatch = localTRegex.exec(paragraph)) !== null) {
      fullText += tMatch[1];
    }

    for (const pattern of textPatterns) {
      if (fullText.includes(pattern)) {
        return ""; // Remove the entire paragraph
      }
    }

    return paragraph; // Keep it
  });
}

/**
 * Convert a number to English words (for threshold text).
 */
function numberToWords(n: number): string {
  const ones = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const tens = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  ];
  if (n < 20) return ones[n];
  if (n < 100) {
    const t = tens[Math.floor(n / 10)];
    const o = ones[n % 10];
    return o ? `${t}-${o}` : t;
  }
  return String(n);
}

// ─── Main Export ─────────────────────────────────────────────────────

export async function generateDocument(
  answers: QuestionnaireAnswers
): Promise<{ buffer: Buffer; filename: string }> {
  const entityName = answers.entity_name || "Agreement";
  const sanitized = entityName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

  if (answers.entity_type === "LLC") {
    return {
      buffer: generateLLC(answers),
      filename: `Operating_Agreement_${sanitized}.docx`,
    };
  }
  return {
    buffer: generateCorp(answers),
    filename: `Shareholder_Agreement_${sanitized}.docx`,
  };
}
