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


  // For 3+ owners, keep member_01 and member_02 as individual names
  // (used in capital table, MPI table, signatures).
  // The preamble "by A and B" will be fixed via post-processing.

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

  // Remove % from signature lines — "60% Owner of the Company" → "Owner of the Company"
  for (const owner of answers.owners_list) {
    xml = xmlTextReplace(
      xml,
      `${owner.shares_or_percentage}% Owner of the Company`,
      "Owner of the Company",
      false
    );
  }

  // Add keepNext to all section headings to prevent page breaks between heading and body
  xml = addKeepNextToHeadings(xml);

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

  // Fix preamble: "by Ana Perfecta and Bruno Perfecto" → "by Ana Perfecta, Bruno Perfecto, and Carmen Perfecta"
  const owner1 = answers.owners_list[0]?.full_name || "";
  const owner2 = answers.owners_list[1]?.full_name || "";
  if (owner1 && owner2) {
    const allNames = answers.owners_list.map((o) => o.full_name);
    const preambleNames = allNames.length === 2
      ? `${allNames[0]} and ${allNames[1]}`
      : allNames.slice(0, -1).join(", ") + ", and " + allNames[allNames.length - 1];
    // The template renders "by {{member_01_full_name}} and {{member_02_full_name}}"
    // After docxtemplater, it becomes "by Ana Perfecta and Bruno Perfecto"
    xml = xmlTextReplace(
      xml,
      `${owner1} and ${owner2}`,
      preambleNames,
      false // only replace the first occurrence (preamble)
    );
  }

  // Extract formatting from the capital contributions section
  const capFmt = extractFormatting(xml, answers.owners_list[1]?.full_name || "$");
  const sigFmt = extractFormatting(xml, "Owner of the Company");

  // Build text lines for capital contributions (Sec 5.1)
  for (const owner of extraOwners) {
    const line = `${owner.full_name}           $${formatCurrency(owner.capital_contribution)}`;
    const member02Amount = formatCurrency(answers.owners_list[1]?.capital_contribution || 0);
    const searchText = `$${member02Amount}`;
    xml = xmlTextReplace(
      xml,
      searchText,
      `${searchText}</w:t></w:r></w:p>${buildFormattedParagraph(line, capFmt.pPr, capFmt.rPr)}<w:p><w:r><w:t xml:space="preserve">`,
      false
    );
  }

  // Build text lines for MPI percentages (Sec 7.4)
  const mpiFmt = extractFormatting(xml, "Members Percentage Interests");
  for (const owner of extraOwners) {
    const line = `${owner.full_name}           ${owner.shares_or_percentage}%`;
    const member02Pct = `${answers.owners_list[1]?.shares_or_percentage || 0}%`;
    xml = xmlTextReplace(
      xml,
      member02Pct,
      `${member02Pct}</w:t></w:r></w:p>${buildFormattedParagraph(line, mpiFmt.pPr, mpiFmt.rPr)}<w:p><w:r><w:t xml:space="preserve">`,
      false
    );
  }

  // Build signature blocks for extra members with matching formatting
  const lastMember2Sig = `Owner of the Company`;
  const extraSigBlocks = extraOwners
    .map(
      (owner) =>
        `</w:t></w:r></w:p>` +
        buildFormattedParagraph(`By: __________________________`, sigFmt.pPr, sigFmt.rPr) +
        buildFormattedParagraph(`Name: ${owner.full_name}`, sigFmt.pPr, sigFmt.rPr) +
        buildFormattedParagraph(`Owner of the Company`, sigFmt.pPr, sigFmt.rPr) +
        `<w:p><w:r><w:t xml:space="preserve">`
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
  // Template has "50.1%" — replace with user's threshold (e.g., "50.01%")
  if (answers.majority_threshold) {
    const majPct = typeof answers.majority_threshold === 'number'
      ? answers.majority_threshold.toFixed(2).replace(/\.?0+$/, '')
      : String(answers.majority_threshold);
    xml = xmlTextReplace(xml, "50.1%", `${majPct}%`, true);
  }

  // Add Super Majority definition for LLC (between Sec 19.7 and 19.8)
  // LLC template has "19.7 Majority Defined" then "19.8 INDEMNIFICATION"
  // Insert Super Majority definition and renumber INDEMNIFICATION to 19.9
  if (answers.supermajority_threshold) {
    const supPct = answers.supermajority_threshold;
    const supPctFormatted = typeof supPct === 'number' && supPct % 1 === 0 ? `${supPct}.00` : String(supPct);
    const supText = `${numberToWords(supPct).toUpperCase()} PERCENT (${supPctFormatted}%)`;
    // The LLC Majority definition ends with "50.1% of the total MPI held by all Members."
    // Insert Super Majority definition after that text.
    const llcSupFmt = extractFormatting(xml, "Majority Defined");
    xml = xmlTextReplace(
      xml,
      "total MPI held by all Members.",
      `total MPI held by all Members.${closeParagraphAndInsert(
        `19.8 Super Majority Defined. Members collectively holding greater than ${supText} of the total MPI held by all Members.`,
        llcSupFmt.pPr, llcSupFmt.rPr
      )}`,
      false
    );
  }

  // Replace spending threshold in Sec 11.4
  if (answers.major_spending_threshold) {
    const threshold = formatCurrency(answers.major_spending_threshold);
    // The LLC template has $5,000.00 in multiple sub-items of Sec 11.4
    xml = xmlTextReplace(xml, "$5,000.00", `$${threshold}`, true);
  }

  // Replace ROFR offer period (Sec 12.1) — template has "30 calendar days"
  if (answers.rofr_offer_period && answers.rofr_offer_period !== 30) {
    xml = xmlTextReplace(
      xml,
      "30 calendar days of receiving the Proposal",
      `${answers.rofr_offer_period} calendar days of receiving the Proposal`,
      false
    );
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

  // Non-compete: Insert Sec 11.12 when non-compete=Yes
  // The LLC template doesn't have this section — we add it via XML post-processing.
  // Text provided by attorney Antonio Regojo.
  if (answers.include_noncompete) {
    const duration = answers.noncompete_duration || 2;
    const durationWord = numberToWords(duration).toUpperCase();
    const nonCompeteText =
      `11.12 Non-competition. ` +
      `(a) Covenant Against Competition. During the term of this Agreement and for ${durationWord} (${duration}) years following termination as a Member, Manager and/or employee of the Company (the "Restrictive Period"), no Member (nor any member, partner, owner, officer, director or manager of such Member) shall directly or indirectly, individually or on behalf of any Person other than the Company or any affiliate or subsidiary of the Company: ` +
      `(i) solicit any Customers of the Company for the purpose of selling to them products or services competitive with the products or services sold by the Company; ` +
      `(ii) provide directly or indirectly products, services, or assist anyone to provide the products or services of the type provided by the Company during the term of this Agreement, to any Person (other than the Company) which is then engaged within the Territory in a business similar to the Company's Business; or ` +
      `(iii) solicit or induce, or in any manner attempt to solicit or induce, any person employed by the Company to leave such employment, whether or not such employment is pursuant to a written contract with the Company or is at-will. ` +
      `The Member's obligations under this paragraph shall survive any expiration or termination of this Agreement. As used herein, the term "Territory" means ${answers.noncompete_scope ? answers.noncompete_scope : "anywhere in the United States where the Company has Customers"}. As used herein, the term "Customers" means all Persons that have conducted business with the Company during the three (3) year period immediately prior to any termination or expiration of this Agreement. Notwithstanding the foregoing, the Members shall be permitted to provide services for others provided that such services are in compliance with this Section.`;

    // Insert BEFORE Non-Disparagement (11.12) and renumber it to 11.13
    // In the XML, "11.12" and "Non-Disparagement" are in separate <w:t> runs.
    // Strategy: find the <w:t> containing "11.12" that's closest before "Non-Disparagement"
    const llcFmt = extractFormatting(xml, "Non-Disparagement");
    const ndIdx = xml.indexOf("Non-Disparagement");
    if (ndIdx >= 0) {
      // Find "11.12" in a <w:t> tag closest to (before) Non-Disparagement
      // Search backwards from Non-Disparagement position
      const beforeND = xml.substring(0, ndIdx);
      const lastT = beforeND.lastIndexOf(">11.12<");
      if (lastT >= 0) {
        // Replace this specific "11.12" with "11.13"
        xml = beforeND.substring(0, lastT) + ">11.13<" + beforeND.substring(lastT + 7) + xml.substring(ndIdx);

        // Now insert the non-compete paragraph BEFORE the paragraph containing 11.13/Non-Disparagement
        const p13Idx = xml.indexOf("11.13");
        const pStart = xml.lastIndexOf("<w:p", p13Idx);
        const ncParagraph = buildFormattedParagraph(nonCompeteText, llcFmt.pPr, llcFmt.rPr);
        xml = xml.substring(0, pStart) + ncParagraph + xml.substring(pStart);
      }
    }
  }

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

  // Fix #30: Replace hardcoded ownership percentages in signature section
  // IMPORTANT: Must run BEFORE cleanupEmptyCorpShareholders, because cleanup
  // removes "12.5% Owner" paragraphs. If cleanup runs first, owner 2's
  // percentage replacement ("12.5% Owner" -> "45.00% Owner") would fail
  // because the target text was already removed.
  answers.owners_list.forEach((owner, i) => {
    const pct = owner.shares_or_percentage;
    const actualPct = ((Math.round((pct / 100) * totalShares) / totalShares) * 100).toFixed(2);
    const hardcodedPcts = ["75%", "12.5%", "12.5%"];
    if (i < hardcodedPcts.length) {
      // Replace only the first remaining occurrence
      xml = xmlTextReplace(xml, hardcodedPcts[i] + " Owner", "Owner", false);
    }
  });

  // Clean up unused shareholder slots (template has 3 slots)
  // For companies with fewer than 3 shareholders, remove empty rows and signature blocks
  xml = cleanupEmptyCorpShareholders(xml, answers.owners_list.length);

  // Voting text replacements
  xml = applyCorpVotingReplacements(xml, answers);

  // Bank account text (additional replacements beyond the template var)
  xml = applyCorpBankAccountText(xml, answers);

  // Conditional section removal
  xml = removeCorpConditionalSections(xml, answers);

  // Add Super Majority definition after Majority definition (1.6) for Corp
  // Attorney format: "Super Majority. Shareholders collectively holding greater than
  // SEVENTY FIVE PERCENT (75.00%) of the Percentage Interests of all the Shareholders eligible to vote."
  if (answers.supermajority_threshold) {
    const supPct = answers.supermajority_threshold;
    const supPctFormatted = typeof supPct === 'number' && supPct % 1 === 0 ? `${supPct}.00` : String(supPct);
    const supText = `${numberToWords(supPct).toUpperCase()} PERCENT (${supPctFormatted}%)`;
    xml = xmlTextReplace(
      xml,
      "eligible to vote.",
      `eligible to vote.  1.7 Super Majority. Shareholders collectively holding greater than ${supText} of the Percentage Interests of all the Shareholders eligible to vote.`,
      false
    );
    // Renumber subsequent sections: 1.7 Officers → 1.8, 1.8 → 1.9, etc.
    // The Corp template has 1.7 Officers, 1.8 Percentage Interest, etc.
    // Find "1.7" that's the Officers heading (in a <w:t> near "Officers")
    const offIdx = xml.indexOf("Officers");
    if (offIdx >= 0) {
      const before = xml.substring(0, offIdx);
      const last17 = before.lastIndexOf(">1.7<");
      if (last17 >= 0 && (offIdx - last17) < 300) {
        xml = before.substring(0, last17) + ">1.8<" + before.substring(last17 + 5) + xml.substring(offIdx);
        // Also renumber 1.8 Percentage Interest → 1.9, etc.
        const piIdx = xml.indexOf("Percentage Interest");
        if (piIdx >= 0) {
          const before2 = xml.substring(0, piIdx);
          const last18 = before2.lastIndexOf(">1.8<");
          if (last18 >= 0 && (piIdx - last18) < 300) {
            xml = before2.substring(0, last18) + ">1.9<" + before2.substring(last18 + 5) + xml.substring(piIdx);
          }
        }
      }
    }
  }

  // Add keepNext to all section headings to prevent page breaks between heading and body
  xml = addKeepNextToHeadings(xml);

  renderedZip.file("word/document.xml", xml);

  return Buffer.from(
    renderedZip.generate({
      type: "nodebuffer",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  );
}

// ─── Corp Cleanup Empty Shareholders ─────────────────────────────────

/**
 * Remove empty shareholder rows from the capital table and signature block.
 * The Corp template has 3 hardcoded shareholder slots. If there are fewer
 * than 3 owners, the unused slots render as empty rows ("$", "%") in the
 * capital table and empty signature blocks ("Name: [blank]", "12.5% Owner").
 */
function cleanupEmptyCorpShareholders(xml: string, ownerCount: number): string {
  if (ownerCount >= 3) return xml; // All 3 slots used

  // Remove empty capital table rows by finding <w:tr> that contain "$" and "%"
  // but no actual shareholder name. We look for table rows where the first cell
  // (name) is empty.
  // Strategy: find all paragraphs, assemble per-row text, remove empty rows.

  // Simpler: remove paragraphs containing just "$" or just "%" that are in table cells
  // The empty row renders as: [empty] | [empty] | $ | %
  // In the assembled text this shows as "$%" between two shareholder rows

  // Remove the 3rd signature block: "By: ___" + "Name: [empty]" + "12.5% Owner"
  if (ownerCount < 3) {
    // Remove "12.5% Owner" paragraph
    xml = removeXmlParagraphsContaining(xml, ["12.5% Owner"]);

    // Find and remove the "By: ______" and "Name:   " paragraphs for the empty 3rd slot.
    // These are the LAST occurrence of "By: ______" and the empty "Name:" before "CORPORATION"
    // Use lastIndexOf to find the CORPORATION in the signature block (not in article headings)
    const corpIdx = xml.lastIndexOf('"CORPORATION"') >= 0
      ? xml.lastIndexOf('"CORPORATION"')
      : xml.lastIndexOf("CORPORATION");
    if (corpIdx >= 0) {
      // Work backwards from "CORPORATION" to find the empty signature block
      const beforeCorp = xml.substring(0, corpIdx);

      // Find last "By:" paragraph before CORPORATION that has no name after it
      // The pattern is: By: ___ </w:p> <w:p> Name: </w:p> (empty name)
      // Remove the last By: + Name: pair before CORPORATION
      const lastByIdx = beforeCorp.lastIndexOf("By: ______");
      if (lastByIdx >= 0) {
        // Find the paragraph start for this "By:"
        const byPStart = xml.lastIndexOf("<w:p", lastByIdx);
        // Find the next paragraph after "By:" which should be "Name: [empty]"
        const byPEnd = xml.indexOf("</w:p>", lastByIdx);
        const nameStart = xml.indexOf("<w:p", byPEnd);
        const namePEnd = xml.indexOf("</w:p>", nameStart);

        // Check if this Name paragraph is empty (just "Name:" with whitespace)
        const namePara = xml.substring(nameStart, namePEnd + 6);
        const nameTexts = (namePara.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
          .map((t: string) => t.replace(/<[^>]+>/g, "")).join("").trim();

        if (nameTexts.startsWith("Name:") && nameTexts.replace("Name:", "").trim() === "") {
          // Remove both paragraphs (By: + empty Name:)
          xml = xml.substring(0, byPStart) + xml.substring(namePEnd + 6);
        }
      }
    }
  }

  // Remove empty capital table row
  // Find table rows where all cells are empty or just contain "$" / "%"
  // The empty row in assembled text is just "$%" between valid rows
  // In XML: it's a <w:tr> with cells containing no text or just "$" / "%"
  const trRegex = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
  let match;
  const rowsToRemove: string[] = [];
  while ((match = trRegex.exec(xml)) !== null) {
    const row = match[0];
    const rowTexts = (row.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t: string) => t.replace(/<[^>]+>/g, "")).join("").trim();
    // Empty row: just "$" and/or "%" with no actual name/data
    if (rowTexts === "$%" || rowTexts === "$" || rowTexts === "%" || rowTexts === "") {
      // But only remove if it's in the capital contributions table (has exactly 4 cells)
      const cellCount = (row.match(/<w:tc\b/g) || []).length;
      if (cellCount === 4) {
        rowsToRemove.push(row);
      }
    }
  }
  for (const row of rowsToRemove) {
    xml = xml.replace(row, "");
  }

  return xml;
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

  // Add extra signature blocks with formatting from existing signatures
  const corpSigFmt = extractFormatting(xml, "Owner");
  const lastSh3Name = answers.owners_list[2]?.full_name || "";
  if (lastSh3Name && sh3) {
    const extraSigs = extraOwners
      .map((owner) => {
        const pct = ((Math.round((owner.shares_or_percentage / 100) * totalShares) / totalShares) * 100).toFixed(2);
        return `</w:t></w:r></w:p>` +
          buildFormattedParagraph(`By: ______________________`, corpSigFmt.pPr, corpSigFmt.rPr) +
          buildFormattedParagraph(`Name:   ${owner.full_name}`, corpSigFmt.pPr, corpSigFmt.rPr) +
          buildFormattedParagraph(`Owner`, corpSigFmt.pPr, corpSigFmt.rPr) +
          `<w:p><w:r><w:t xml:space="preserve">`;
      })
      .join("");

    // Insert after shareholder 3's "% Owner" line
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

  // Non-compete: Insert Sec 10.10 after Non-Disparagement (10.9) when non-compete=Yes
  // Template already has 10.8 Non-Disclosure and 10.9 Non-Disparagement.
  // Text provided by attorney Antonio Regojo.
  if (answers.include_noncompete) {
    const duration = answers.noncompete_duration || 2;
    const durationWord = numberToWords(duration).toUpperCase();
    const nonCompeteText =
      `10.10 Covenant Against Competition. ` +
      `During the term of this Agreement and for ${durationWord} (${duration}) years following termination as a Shareholder, Officer and/or employee of the Corporation (the "Restrictive Period"), no Shareholder shall directly or indirectly, individually or on behalf of any Person other than the Corporation or any affiliate or subsidiary of the Corporation: ` +
      `(i) solicit any Customers of the Corporation for the purpose of selling to them products or services competitive with the products or services sold by the Corporation; ` +
      `(ii) provide directly or indirectly products, services, or assist anyone to provide the products or services of the type provided by the Corporation during the term of this Agreement, to any Person (other than the Corporation) which is then engaged within the Territory in a business similar to the Corporation's Business; or ` +
      `(iii) solicit or induce, or in any manner attempt to solicit or induce, any person employed by the Corporation to leave such employment, whether or not such employment is pursuant to a written contract with the Corporation or is at-will. ` +
      `The Shareholder's obligations under this paragraph shall survive any expiration or termination of this Agreement. As used herein, the term "Territory" means ${answers.noncompete_scope ? answers.noncompete_scope : "anywhere in the United States where the Corporation has Customers"}. As used herein, the term "Customers" means all Persons that have conducted business with the Corporation during the three (3) year period immediately prior to any termination or expiration of this Agreement.`;

    // Insert after 10.9 Non-Disparagement section
    // The Corp template splits "Non-Disparagemen" + "t" across XML runs.
    // Use "10.9" as anchor since it's in a single <w:t> element.
    const corpFmt = extractFormatting(xml, "10.9");
    const corpPPr = corpFmt.pPr || '<w:pPr><w:jc w:val="both"/><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>';
    const corpRPr = corpFmt.rPr || '<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
    // Find the paragraph containing 10.9 and insert the non-compete after it
    const sec109Idx = xml.indexOf(">10.9<");
    if (sec109Idx >= 0) {
      const pEnd = xml.indexOf("</w:p>", sec109Idx);
      if (pEnd >= 0) {
        const insertPoint = pEnd + 6;
        const ncParagraph = buildFormattedParagraph(nonCompeteText, corpPPr, corpRPr);
        xml = xml.substring(0, insertPoint) + ncParagraph + xml.substring(insertPoint);
      }
    }
  }

  return xml;
}

// ─── Keep Next (prevent orphaned headings) ───────────────────────────

/**
 * Add w:keepNext to all section heading paragraphs so they don't get
 * separated from the following body text by a page break.
 *
 * Matches:
 * - LLC: "1.  Formation", "5.   Capital Contributions", "19.   Miscellaneous"
 * - Corp: "ARTICLE I: DEFINITIONS", "1.1Act.", "10.5Board of Directors"
 * - Sub-sections: "5.1The initial...", "11.4Notwithstanding..."
 */
function addKeepNextToHeadings(xml: string): string {
  // Find all <w:p> elements and check if their text starts with a section number
  return xml.replace(/<w:p([ >][\s\S]*?)<\/w:p>/g, (fullMatch, inner) => {
    // Extract text from this paragraph
    const texts = (fullMatch.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t: string) => t.replace(/<[^>]+>/g, "")).join("").trim();

    // Check if this is a heading:
    // "5.   Capital Contributions" or "ARTICLE I" or "11.4Notwithstanding"
    const isHeading =
      /^\d+\.\s{2,}[A-Z]/.test(texts) ||       // "5.   Capital Contributions"
      /^ARTICLE\s+[IVXLC]/i.test(texts) ||      // "ARTICLE I: DEFINITIONS"
      /^\d+\.\d+\s*[A-Z][a-z]/.test(texts);     // "5.1The initial..." (sub-section start)

    if (!isHeading) return fullMatch;

    // Already has keepNext?
    if (fullMatch.includes("w:keepNext")) return fullMatch;

    // Add keepNext to pPr (or create pPr if missing)
    if (fullMatch.includes("<w:pPr>")) {
      // Insert keepNext inside existing pPr (after the opening tag)
      return fullMatch.replace("<w:pPr>", "<w:pPr><w:keepNext/>");
    } else {
      // Create pPr with keepNext
      return fullMatch.replace("<w:p>", "<w:p><w:pPr><w:keepNext/></w:pPr>");
    }
  });
}

// ─── Formatted Paragraph Builder ─────────────────────────────────────

/**
 * Extract paragraph and run formatting properties from a reference paragraph
 * in the XML. Returns the pPr and rPr XML strings to use for new paragraphs.
 */
function extractFormatting(xml: string, nearText: string): { pPr: string; rPr: string } {
  const idx = xml.indexOf(nearText);
  if (idx < 0) return { pPr: "", rPr: "" };

  const pStart = xml.lastIndexOf("<w:p", idx);
  const pEnd = xml.indexOf("</w:p>", idx);
  if (pStart < 0 || pEnd < 0) return { pPr: "", rPr: "" };

  const para = xml.substring(pStart, pEnd);

  // Extract <w:pPr>...</w:pPr>
  const pPrMatch = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";

  // Extract <w:rPr>...</w:rPr> from the first run
  const rPrMatch = para.match(/<w:r[^>]*>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/);
  const rPr = rPrMatch ? rPrMatch[1] : "";

  return { pPr, rPr };
}

/**
 * Build a properly formatted paragraph XML string that matches
 * the template's existing style (font size, indentation, justification).
 */
function buildFormattedParagraph(text: string, pPr: string, rPr: string): string {
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

/**
 * Build a formatted paragraph and return it as a string to insert
 * after closing the current paragraph's text element.
 * Usage: xmlTextReplace(xml, "anchor text", "anchor text" + closeParagraphAndInsert(newText, pPr, rPr))
 */
function closeParagraphAndInsert(text: string, pPr: string, rPr: string): string {
  return `</w:t></w:r></w:p>${buildFormattedParagraph(text, pPr, rPr)}<w:p><w:r><w:t xml:space="preserve">`;
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
