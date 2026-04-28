import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path from "path";

// ─── OOXML helpers ────────────────────────────────────────────────────
// Plain `xml.lastIndexOf("<w:p", i)` also matches `<w:pPr>`, `<w:pStyle>`,
// `<w:pgBorders>` etc., which would cut mid-paragraph and leave an
// unclosed <w:p> tag — that's enough to make LibreOffice/Office Online
// reject the document. Use these helpers to find the *paragraph opener*
// (`<w:p` followed by whitespace or `>`) only.
function paragraphStartBefore(xml: string, from: number): number {
  const re = /<w:p[\s>]/g;
  let best = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m.index > from) break;
    best = m.index;
  }
  return best;
}
function paragraphStartAtOrAfter(xml: string, from: number): number {
  const re = /<w:p[\s>]/g;
  re.lastIndex = Math.max(0, from);
  const m = re.exec(xml);
  return m ? m.index : -1;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface Owner {
  full_name: string;
  shares_or_percentage: number;
  capital_contribution: number;
  /**
   * Optional title/cargo for the Specific Responsibilities section
   * (Step 6 Agreement field: corp_specificResponsibilities_X or llc_specificRoles_X).
   * Empty string = no title entered.
   */
  title?: string;
  /**
   * Optional free-text description of this owner's day-to-day responsibilities
   * (Step 6 Agreement field: corp_responsibilityDesc_X or llc_roleDesc_X).
   * Only rendered into the agreement when at least one owner has a non-empty
   * title or responsibilities.
   */
  responsibilities?: string;
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

  // Specific Responsibilities (per-member title + desc from Step 6).
  // Inserted after the Manager-designation paragraph when any member has
  // either field populated.
  xml = injectResponsibilitiesSection(xml, answers.owners_list, /*isCorp=*/false);

  // Remove [SIGNATURE PAGE BELOW] dangling heading (v2 TODO #17)
  xml = removeSignaturePageBelowHeading(xml);

  // Remove % from signature lines — "60% Owner of the Company" → "Owner of the Company"
  for (const owner of answers.owners_list) {
    xml = xmlTextReplace(
      xml,
      `${owner.shares_or_percentage}% Owner of the Company`,
      "Owner of the Company",
      false
    );
  }

  // Rewrite "Owner of the Company" under each Name with owner.title (or
  // remove it if no title was set) — v2 TODO #16.
  xml = rewriteSignatureOwnerLabel(xml, answers.owners_list);

  // Add keepNext to all section headings to prevent page breaks between heading and body
  xml = addKeepNextToHeadings(xml);
  xml = chainKeepNextThroughEmpties(xml);
  xml = normalizeSubItemTabs(xml);
  xml = enablePaginationFlags(xml);
  xml = repairXml(xml);

  renderedZip.file("word/document.xml", xml);

  // Force Times New Roman as the default font (template's styles.xml defaults to Arial)
  forceTimesNewRomanFont(renderedZip);

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
      // Manager names are user-supplied and go straight into the XML via
      // xmlTextReplace, so escape `&`, `<`, `>` to keep document.xml valid.
      const extraManagerText = extraManagers
        .map((m) => ` and ${xmlEscape(m.name)}`)
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
  // Insert Super Majority definition and renumber the three following
  // sections (INDEMNIFICATION / ATTORNEYS' FEES / WAIVER OF JURY TRIAL)
  // to 19.9 / 19.10 / 19.11.
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

    // Renumber the three sections that follow "19.7 Majority Defined" in
    // the LLC template. In document.xml these numbers live in their own
    // <w:t>N.M</w:t> runs, followed (after some formatting runs) by a
    // <w:t>SECTION TITLE</w:t> run — the section title stays intact, we
    // only rewrite the number. Must run in DESCENDING order so the freshly
    // produced "19.10" from (19.9→19.10) isn't matched again by the next
    // rule targeting "19.10".
    const bumps: Array<{ from: string; to: string; title: string }> = [
      { from: "19.10", to: "19.11", title: "WAIVER OF JURY TRIAL" },
      { from: "19.9", to: "19.10", title: "ATTORNEYS\u2019 FEES" },
      { from: "19.8", to: "19.9", title: "INDEMNIFICATION" },
    ];
    for (const b of bumps) {
      // Cap look-ahead to ~600 chars so we don't accidentally bridge across
      // distant paragraphs. Each section's number-run sits within the same
      // <w:p> as the title run, well within that window.
      const re = new RegExp(
        `(<w:t[^>]*>)${b.from.replace(/\./g, "\\.")}(<\\/w:t>[\\s\\S]{0,600}?<w:t[^>]*>${b.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</w:t>)`,
      );
      xml = xml.replace(re, `$1${b.to}$2`);
    }
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

    // After removing 12.1, shift 12.2..12.10 down by 1 (→ 12.1..12.9) in
    // both section headings and body cross-references. The LLC generator
    // doesn't run renumberAndRemapSubsections, so we do a targeted pass
    // here, limited to Article XII. Must work in ASCENDING order of NEW
    // numbers so we don't collide (rewriting 12.2→12.1 before 12.3→12.2
    // would be fine, but 12.3→12.2 before 12.2→12.1 would make the latter
    // see two 12.2s).
    for (let n = 2; n <= 10; n++) {
      const from = `12.${n}`;
      const to = `12.${n - 1}`;
      // Heading runs: <w:t>12.N</w:t> standalone
      xml = xml.replace(
        new RegExp(`(<w:t[^>]*>)${from}(</w:t>)`, 'g'),
        `$1${to}$2`,
      );
      // Body cross-refs: "Section 12.N", "Paragraph 12.N", etc.
      xml = xml.replace(
        new RegExp(`\\b(Sections?|Paragraphs?|Articles?)(\\s+)${from.replace('.', '\\.')}\\b`, 'gi'),
        `$1$2${to}`,
      );
    }
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
        const pStart = paragraphStartBefore(xml, p13Idx);
        if (pStart >= 0) {
          const ncParagraph = buildFormattedParagraph(nonCompeteText, llcFmt.pPr, llcFmt.rPr);
          xml = xml.substring(0, pStart) + ncParagraph + xml.substring(pStart);
        }
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

  // Rewrite signature "Owner" label with owner.title (or remove it) — TODO #16
  xml = rewriteSignatureOwnerLabel(xml, answers.owners_list);

  // Voting text replacements
  xml = applyCorpVotingReplacements(xml, answers);

  // Bank account text (additional replacements beyond the template var)
  xml = applyCorpBankAccountText(xml, answers);

  // Template bug: after {{principal_address}} the template has a stray
  // superscripted "th" run (left over from when that placeholder was a date).
  // It renders as "...FL 33181ᵗʰ or such other place...". The "th" lives in
  // its own <w:r> marked <w:vertAlign w:val="superscript"/>, so a text-level
  // replace can't span it. Remove the whole run outright.
  xml = xml.replace(
    /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:vertAlign\s+w:val="superscript"\s*\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>th<\/w:t>[\s\S]*?<\/w:r>/g,
    "",
  );

  // ── Fix trailing commas in directors list (TODO #7, video-review bug) ──
  // Template is `initial Directors shall be {{s1}}, {{s2}}, {{s3}}.`; when
  // there are only 2 directors {{s3}} renders empty, producing
  // "...Jane TestTwo, ." — strip the orphan comma.
  // Also handle the 1-director case (", ,") same way.
  xml = xmlTextReplace(xml, ", , .", ".", true);
  xml = xmlTextReplace(xml, ", .", ".", true);
  xml = xmlTextReplace(xml, ",  .", ".", true);

  // ── Fix initial Officers list (TODO #7) ──
  // Template has `The initial Officers shall be as set forth in Section 10.6
  // below.` but Section 10.6 doesn't actually list them. Replace with an
  // inline list of the officers the questionnaire collected.
  if (answers.officers && answers.officers.length > 0) {
    // Officer name/title are user-supplied and injected directly into the
    // XML via xmlTextReplace. Escape `&`, `<`, `>` (e.g. "President & CEO")
    // so the resulting document.xml stays valid.
    const officersList = answers.officers
      .filter((o) => o && o.name)
      .map((o) => (o.title ? `${xmlEscape(o.name)} (${xmlEscape(o.title)})` : xmlEscape(o.name)))
      .join(", ");
    if (officersList) {
      xml = xmlTextReplace(
        xml,
        "The initial Officers shall be as set forth in Section 10.6 below.",
        `The initial Officers shall be: ${officersList}.`,
        false,
      );
    }
  }

  // ── §10.6 Officers list — replace single hardcoded line ──
  // Template ships one paragraph: "{{shareholder_1_name}}\t\t\t\tPresident
  // and Chief Executive Officer" (3 tabs causing erratic spacing). Replace
  // with one paragraph per officer using a single tab stop at 3000 twips so
  // names align at left and titles align in a clean second column.
  xml = renderOfficersList(xml, answers);

  // ── Specific Responsibilities section (from Step 6 of the questionnaire) ──
  // Each owner can have an optional title + responsibilities paragraph.
  // Inject a new section after the Officers sentence if any owner has either.
  xml = injectResponsibilitiesSection(xml, answers.owners_list, /*isCorp=*/true);

  // ── Number the Article II sub-items (TODO #6b) ──
  // Template captions "Articles", "Purpose", "Name", "Place of Business" have
  // no sub-numbering. Prefix them with 2.1, 2.2, 2.3, 2.4 (they occur in this
  // order between "ARTICLE II: INCORPORATION" and "ARTICLE III").
  // These captions aren't Heading3-styled so the generic renumber pass below
  // would skip them; prefixArticle2Subsections handles them via exact-text
  // matching. The later renumber pass is idempotent on them (already 2.1-2.4).
  xml = prefixArticle2Subsections(xml);

  // ── Shrink § 4.2 Capital Contributions table (v2 TODO #10) ──
  xml = fixCapitalTableWidth(xml);

  // ── Remove [SIGNATURE PAGE BELOW] dangling heading (v2 TODO #17) ──
  xml = removeSignaturePageBelowHeading(xml);

  // NOTE: fixSection92ListIndent is applied AFTER normalizeSubItemTabs
  // below, otherwise normalizeSubItemTabs will overwrite its 720/hanging
  // indent with the standard 1440 left indent for all romanette paragraphs.

  // Conditional section removal
  xml = removeCorpConditionalSections(xml, answers);

  // Promote the orphan "(c) In the event that a Shareholder has elected to
  // sell its Shares …" paragraph into a Heading3-styled subsection. The
  // template ships it as a lone (c) with no (a)/(b) — a pre-existing template
  // defect. Convert to an inline-titled subsection so renumberAndRemapSubsections
  // (branch c) assigns it the right §13.X number.
  if (answers.right_of_first_refusal) {
    xml = promoteCorpOrphanElectionToSell(xml);
  }

  // Fix inline-title paragraphs whose period sits inside the underlined
  // title run instead of at the start of the body run — branch (c) of
  // renumberAndRemapSubsections needs the period in the body for the
  // section to get a §X.Y number assigned. Affects "Purchase of Shareholder
  // Interests upon Deadlock." and any structurally similar paragraph.
  xml = normalizeInlineTitlePeriod(xml);

  // Strip leading whitespace-only run from §10.6 "Officers" — the template
  // ships it with 5 leading spaces in run[0] which keeps renumberAndRemap
  // -Subsections branch (c) from recognizing it as a Heading3 (since the
  // first run isn't underlined). After stripping, run[1] (underlined
  // "Officers") becomes the first run and the section gets numbered.
  xml = stripLeadingWhitespaceFromOfficersHeading(xml);

  // §14.7's continuation body paragraph ("If the Corporation fails to
  // notify the Divorcing Shareholder…") ships with a quirky indent
  // (left=1420 hanging=656) that visually steps it inward from §14.7's
  // body wrap. Normalize to left=1440 body indent so the paragraph
  // reads as a clean continuation.
  xml = normalize147ContinuationIndent(xml);

  // Add an underlined "Banking" title to the §10.7 paragraph that ships
  // titleless ("All funds of the Corporation shall be deposited…").
  xml = addBankingHeading(xml);

  // Add an "Approved Sale." Heading3 title to the orphan §13.6 paragraph
  // ("In the event that Shareholders holding at least 50.1% of the Shares
  // desire to sell …"). Template ships it titleless, so renumberAndRemap-
  // Subsections has nothing to detect; this prepends a branch-(c)-shaped
  // title so the §X.Y number is assigned automatically.
  if (answers.drag_along || answers.tag_along) {
    xml = addApprovedSaleHeading(xml);
  }

  // §13.1 ships as a bare title "Right of First Refusal." with NO body —
  // the user complains that an empty §13.1 alongside §13.2 with body looks
  // wrong. Add a one-sentence introduction and rewrite the run structure
  // so it standardizes correctly (template's run[0] is a stray <w:tab/>
  // that confuses standardizeNumberedHeadingShape).
  if (answers.right_of_first_refusal) {
    xml = addRofrIntroBody(xml);
  }

  // The "The Transferor shall deliver a notice of the proposed transfer …"
  // paragraph that sits between §13.2 Offer and §13.3 Concurrence is body
  // text with no number/letter — the user wants it labeled. Promote it to
  // its own §13.X subsection titled "Notice of Proposed Transfer". After
  // renumber, it lands as §13.3 and existing §13.3-§13.6 shift up.
  if (answers.right_of_first_refusal) {
    xml = promoteTransferorNoticeSection(xml);
  }

  // Drag Along + Tag Along are first-level sub-items under §13.6 Approved
  // Sale. Template has Drag Along mislabeled as "i." (roman) and Tag Along
  // unlabeled. First-level sub-items use letter labels (cf. §8.1 A.–E.,
  // §8.4 A.–C., §10.2 A.–G.); romans are only for the second level (cf.
  // §4.1 B. → i. Voting / ii. Dividends). Relabel to A./B. with letter indent.
  if (answers.drag_along) {
    xml = relabelDragAlong(xml);
  }
  if (answers.tag_along) {
    xml = addTagAlongLabel(xml);
  }

  // §13.5's lone "(i) If a Bona Fide Offer …" sub-item is at the second
  // level under the Heading3 — same convention as Drag/Tag Along: use
  // letters, not romans. (i) → (a), canonicalize handles A.
  xml = relabelBonaFideOfferItem(xml);

  // §10.6 Non-Disclosure ships with four mislabeled level-2 items as
  // (i)/(ii)/(iii)/(iv) — by the 1.N → A. → i. convention these should
  // be (a)/(b)/(c)/(d). Rewrite scoped to §10.6 only (§9.2's romanette
  // list is at level 3 and stays roman).
  xml = relabelNonDisclosureSubitems(xml);

  // Add Super Majority definition after Majority definition (1.6) for Corp
  // Attorney format: "Super Majority. Shareholders collectively holding greater than
  // SEVENTY FIVE PERCENT (75.00%) of the Percentage Interests of all the Shareholders eligible to vote."
  //
  // Strategy: cascade-renumber sections 1.7..1.10 → 1.8..1.11 FIRST (in reverse
  // to avoid collisions), then insert the new 1.7 Super Majority as a proper
  // standalone paragraph cloning the 1.6 Majority formatting.
  if (answers.supermajority_threshold) {
    const supPct = answers.supermajority_threshold;
    const supPctFormatted =
      typeof supPct === "number" && supPct % 1 === 0
        ? `${supPct}.00`
        : String(supPct);
    const supText = `${numberToWords(supPct).toUpperCase()} PERCENT (${supPctFormatted}%)`;

    // 1. Collect all numbered section paragraphs in Article I whose first <w:t>
    //    is "1.N" (N >= 7). These are Officers, Percentage Interest, Share or
    //    Shares, Successor. Renumber in reverse order so we don't collide.
    xml = cascadeRenumberCorpArticleI(xml, 7);

    // 2. Insert a NEW 1.7 Super Majority paragraph right after the 1.6 Majority
    //    paragraph, cloning its <w:pPr> so the new paragraph matches the
    //    Heading3 style / tabs / indent of surrounding definitions.
    xml = insertSuperMajorityCorp(xml, supText);
  }

  // ── Sequentially renumber every Article's Heading3 sub-items ──
  // Runs AFTER all conditional content changes (responsibilities injection,
  // ROFR/Drag-Along/Tag-Along removal, Non-Compete insertion, Super Majority
  // insertion) so numbering reflects the final surviving paragraph set. This
  // closes any template gaps (e.g. missing 1.2) AND gaps introduced by
  // conditional removal (e.g. removing Article XII's ROFR sections). Builds
  // an old→new map and rewrites every "Section N.M" / "Paragraph N.M" /
  // "Article N.M" cross-reference in the body text accordingly.
  xml = renumberAndRemapSubsections(xml);

  // Ensure every pair of consecutive §X.Y headings has an empty
  // separator paragraph between them. The template ships several
  // pairs adjacent (notably §1.1/§1.2). Run AFTER renumber so all
  // sections have their final §X.Y prefix.
  xml = ensureSeparatorsBetweenHeadings(xml);

  // Add keepNext to all section headings to prevent page breaks between heading and body
  xml = addKeepNextToHeadings(xml);
  xml = chainKeepNextThroughEmpties(xml);
  xml = normalizeSubItemTabs(xml);
  // § 9.2 romanette list fix (v2 #11/#12) must run AFTER normalizeSubItemTabs:
  // that pass resets <w:ind> on all romanette paragraphs to the standard
  // 1440 / firstLine=0 layout, which would otherwise clobber our hanging-indent fix.
  xml = fixSection92ListIndent(xml);
  // Normalize numbered-section heading indents/tabs so that all section titles
  // (1.1 / 1.10 / 2.1 / 15.11 etc.) align at the same horizontal position
  // regardless of number width. The template has baked-in per-paragraph
  // variations (w:left ranges from 706 to 787) that we flatten here.
  xml = normalizeSectionNumberTabs(xml);
  xml = addDissolutionLettering(xml);
  xml = addReimbursableExpensesLettering(xml);
  xml = addDissolutionWaterfallLettering(xml);
  xml = addTaxReturnsLettering(xml);
  xml = addInvoluntaryTransferLettering(xml);
  xml = addLimitationOnOfficersLettering(xml);
  xml = addShareholderAssignmentLettering(xml);
  xml = addDeliveryToShareholderRomanList(xml);
  // Generic fallback: any paragraph ending with ":" followed by sibling
  // paragraphs at the standard letter/roman list indent without any
  // labels gets sequentially labeled. Catches every "introduce-and-list"
  // pattern at once instead of one targeted function per section.
  xml = autoLabelColonIntroducedLists(xml);
  xml = collapseConsecutiveEmptyParagraphs(xml);
  xml = normalizeListParagraphs(xml);
  xml = enablePaginationFlags(xml);
  xml = stripEmptyParagraphPageBreaks(xml);
  xml = normalizeNewShareholdersHeading(xml);
  xml = standardizeNumberedHeadingShape(xml);
  xml = mergeTitleOnlyHeadingsWithBody(xml);
  xml = rebuildFracturedNumberedHeadings(xml);
  xml = collapseEmptiesBetweenListItems(xml);
  xml = removeKeepLinesFromListItems(xml);
  xml = normalizeAllSectionHeadingPPr(xml);
  xml = stripBoldFromInlineTitleRuns(xml);
  xml = fixArticle14CrossReferences(xml);
  xml = closeArticleXIIIGap(xml);
  // Re-run keepNext-chain after merge/normalize, since merging
  // paragraphs creates new empty separator neighborhoods that need
  // re-evaluation.
  xml = chainKeepNextThroughEmpties(xml);
  xml = forceKeepNextBeforeTables(xml);
  xml = normalizeSignatureBlockLayout(xml);
  // Sig spacing must run AFTER normalizeSignatureBlockLayout, which
  // is what makes every sig-block paragraph carry explicit ind=5040
  // (templates leave it inherited and our paragraph-walk can't tell
  // them apart from other paragraphs without the explicit marker).
  xml = expandSignatureBlockSpacing(xml);
  xml = repairXml(xml);

  renderedZip.file("word/document.xml", xml);

  // Force Times New Roman as the default font (template's styles.xml defaults to Arial)
  forceTimesNewRomanFont(renderedZip);

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

  // Remove empty signature blocks: "By: ___" + "Name: [empty]" + (optional)
  // "12.5% Owner" tag. Template has 3 hardcoded sig slots; for 1-owner we
  // remove TWO empty slots (2nd + 3rd), for 2-owner we remove ONE (3rd).
  // Iterate until no more empty Name: paragraphs remain in the sig block.
  if (ownerCount < 3) {
    // Remove any "12.5% Owner" paragraph (only present when 3-slot template
    // ships ownership-percentage tags).
    xml = removeXmlParagraphsContaining(xml, ["12.5% Owner"]);

    // Loop the removal until there are no more empty "Name:" sig-block lines.
    // Each iteration finds the LAST "By: ______" before "CORPORATION" whose
    // following "Name:" paragraph is empty, and removes both. Cap at 5
    // iterations as a safety net.
    for (let pass = 0; pass < 5; pass++) {
      const corpIdx =
        xml.lastIndexOf('"CORPORATION"') >= 0
          ? xml.lastIndexOf('"CORPORATION"')
          : xml.lastIndexOf("CORPORATION");
      if (corpIdx < 0) break;

      const beforeCorp = xml.substring(0, corpIdx);
      const lastByIdx = beforeCorp.lastIndexOf("By: ______");
      if (lastByIdx < 0) break;

      const byPStart = paragraphStartBefore(xml, lastByIdx);
      const byPEnd = xml.indexOf("</w:p>", lastByIdx);
      const nameStart = byPEnd >= 0 ? paragraphStartAtOrAfter(xml, byPEnd + 6) : -1;
      const namePEnd = nameStart >= 0 ? xml.indexOf("</w:p>", nameStart) : -1;
      if (byPStart < 0 || byPEnd < 0 || nameStart < 0 || namePEnd < 0) break;

      const namePara = xml.substring(nameStart, namePEnd + 6);
      const nameTexts = (namePara.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
        .map((t: string) => t.replace(/<[^>]+>/g, ""))
        .join("")
        .trim();

      // If this Name: line has actual content, the empty-block chain ends.
      if (!(nameTexts.startsWith("Name:") && nameTexts.replace("Name:", "").trim() === "")) {
        break;
      }

      // Remove both paragraphs (By: + empty Name:) and continue scanning.
      xml = xml.substring(0, byPStart) + xml.substring(namePEnd + 6);
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
  // Clone the rendered shareholder_3 <w:tr> so overflow rows inherit the
  // template's <w:trPr>/<w:tcPr>/<w:tcBorders>. Bare <w:tc> blocks render
  // borderless because cells inherit their borders from <w:tcBorders>, not
  // from the table-level <w:tblBorders>.
  const sh3 = answers.owners_list[2];
  if (sh3 && extraOwners.length > 0) {
    const nameIdx = xml.indexOf(xmlEscape(sh3.full_name));
    const trOpenA = xml.lastIndexOf("<w:tr>", nameIdx);
    const trOpenB = xml.lastIndexOf("<w:tr ", nameIdx);
    const trStart = Math.max(trOpenA, trOpenB);
    const trCloseStart = xml.indexOf("</w:tr>", nameIdx);
    const trEnd = trCloseStart + "</w:tr>".length;
    const templateRow = xml.substring(trStart, trEnd);

    // Replace the 4 <w:t> text runs in order: name, shares, $contribution, pct%.
    // Stricter than `<w:t[^>]*>` so we don't accidentally match <w:tc>/<w:tr>/etc.
    const overflow = extraOwners.map((owner) => {
      const shares = Math.round((owner.shares_or_percentage / 100) * totalShares);
      const pct = ((shares / totalShares) * 100).toFixed(2);
      const cellTexts = [
        xmlEscape(owner.full_name),
        shares.toLocaleString(),
        `$${formatCurrency(owner.capital_contribution)}`,
        `${pct}%`,
      ];
      let i = 0;
      return templateRow.replace(
        /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,
        (_, open: string, txt: string, close: string) =>
          i < cellTexts.length ? `${open}${cellTexts[i++]}${close}` : `${open}${txt}${close}`,
      );
    }).join("");
    xml = xml.substring(0, trEnd) + overflow + xml.substring(trEnd);
  }

  // Add extra signature blocks with formatting from existing signatures.
  // The "Owner" anchor's rPr includes <w:b w:val="1"/> (the ownership-
  // tag is bold in the template), but "By:" and "Name:" labels in
  // existing slots are NON-bold (only the actual shareholder name is
  // bold). Strip <w:b>/<w:bCs> from the rPr used for "By:" and "Name:"
  // so inserted blocks visually match shareholders 1-3.
  const corpSigFmt = extractFormatting(xml, "Owner");
  const labelRPr = corpSigFmt.rPr
    .replace(/<w:b w:val="1"\/>/g, "")
    .replace(/<w:bCs w:val="1"\/>/g, "");
  const lastSh3Name = answers.owners_list[2]?.full_name || "";
  if (lastSh3Name && sh3) {
    // Empty separator paragraph between sig blocks — matches the visual
    // gap between original slots 1/2/3 (Roberto/Ana/Carlos all separated
    // by an empty paragraph in the template). Without this, the first
    // inserted block (Maria) jams against Carlos's "Name:" line.
    const sepPara = buildFormattedParagraph("", corpSigFmt.pPr, labelRPr);
    const extraSigs = extraOwners
      .map((owner) => {
        const pct = ((Math.round((owner.shares_or_percentage / 100) * totalShares) / totalShares) * 100).toFixed(2);
        return `</w:t></w:r></w:p>` +
          sepPara +
          buildFormattedParagraph(`By: ______________________`, corpSigFmt.pPr, labelRPr) +
          buildFormattedParagraph(`Name:   ${owner.full_name}`, corpSigFmt.pPr, labelRPr) +
          buildFormattedParagraph(`Owner`, corpSigFmt.pPr, corpSigFmt.rPr) +
          `<w:p><w:r><w:t xml:space="preserve">`;
      })
      .join("");

    // Insert after shareholder 3's "% Owner" line. The template ships
    // TWO "12.5% Owner" placeholders (slots 2 AND 3 both default to
    // 12.5%) — we must replace the LAST one (slot 3 = sh3) so the
    // extra sigs land AFTER slot 3, preserving owner ordering. Replacing
    // the first occurrence pushes shareholder 3 (e.g. Carlos Lopez) to
    // the end of the sig block, scrambling the legal owner order.
    const sh3Pct = ((Math.round((sh3.shares_or_percentage / 100) * totalShares) / totalShares) * 100).toFixed(2);
    const lastTagIdx = xml.lastIndexOf("12.5% Owner");
    if (lastTagIdx >= 0) {
      xml =
        xml.substring(0, lastTagIdx) +
        `${sh3Pct}% Owner` +
        extraSigs +
        xml.substring(lastTagIdx + "12.5% Owner".length);
    }
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

  // NOTE: spending threshold rendering is handled by the direct docxtemplater
  // placeholder `${{major_spending_threshold}}` (see generateCorp's render
  // payload). No post-processing needed here.
  //
  // A previous block tried `xmlTextReplace(xml, "5,000.00", threshold)` as a
  // fallback, but the pattern "5,000.00" also matches inside any threshold
  // ending in 5,000 (e.g. 25,000.00 / 35,000.00 / 45,000.00), producing
  // compound substitutions like "$25,000.00" -> "$225,000.00" — the exact
  // bug the client flagged in video1120173093 TODO #13.

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

    // The Corp template has an inline body ref "The application of this
    // clause shall not trigger paragraph 13.2 below." inside Section 4.4.
    // Article XIII is entirely ROFR and got removed above, so paragraph
    // 13.2 no longer exists — strip the dangling sentence. Keep the
    // leading space tidy.
    xml = xmlTextReplace(
      xml,
      "  The application of this clause shall not trigger paragraph 13.2 below.",
      "",
      true,
    );
    xml = xmlTextReplace(
      xml,
      " The application of this clause shall not trigger paragraph 13.2 below.",
      "",
      true,
    );
    xml = xmlTextReplace(
      xml,
      "The application of this clause shall not trigger paragraph 13.2 below.",
      "",
      true,
    );
  }

  // Drag-Along = No
  if (!answers.drag_along) {
    xml = removeXmlParagraphsContaining(xml, ["Drag Along"]);
  }

  // Tag-Along = No
  if (!answers.tag_along) {
    xml = removeXmlParagraphsContaining(xml, ["Tag Along"]);
  }

  // When BOTH drag_along AND tag_along are off, the entire §13.X
  // "Approved Sale" body paragraph also has no purpose. addApprovedSale
  // -Heading is gated on (drag || tag), so when both are off no title
  // gets injected — but the body paragraph "In the event that Shareholders
  // holding at least 50.1% …" remains, leaving an unnumbered orphan body
  // under ARTICLE XIII. Strip it so the article is clean.
  if (!answers.drag_along && !answers.tag_along) {
    xml = removeXmlParagraphsContaining(xml, [
      "In the event that Shareholders holding at least 50.1%",
    ]);
  }

  // If ARTICLE XIII ends up with NO §X.Y subsections (rofr=F drag=F
  // tag=F), the heading itself is purposeless — remove "ARTICLE XIII:
  // TRANSFERS AND ASSIGNMENTS" entirely.
  if (
    !answers.right_of_first_refusal &&
    !answers.drag_along &&
    !answers.tag_along
  ) {
    xml = removeXmlParagraphsContaining(xml, [
      "ARTICLE XIII: TRANSFERS AND ASSIGNMENTS",
    ]);
  }

  // Non-compete: insert "Covenant Against Competition" at the end of Article 10
  // and let the downstream renumberAndRemapSubsections pass assign the correct
  // section number. Strategy:
  //   1. Insert a Heading3-styled paragraph WITHOUT any "10.X" prefix in its
  //      text — just "Covenant Against Competition. …" starting at the body.
  //   2. Renumber's Shape-C path ("unnumbered caption") then prepends the
  //      correct sequential "10.N " at rewrite time.
  // This is self-healing against any future template renumbering because we
  // never encode a specific number in our inserted text.
  //
  // Anchor: the Corp template's literal ">10.9<" still exists in the pre-
  // renumber XML (confirmed by scanning — 10.5, 10.8, 10.9 are plain
  // paragraphs with the number in a single <w:t>). ">10.9<" is reliable
  // until the template is re-authored to remove Non-Disparagement entirely.
  // If it disappears, we fall back to ">10.8<", then ">10.7<", etc.
  //
  // Text provided by attorney Antonio Regojo.
  if (answers.include_noncompete) {
    const duration = answers.noncompete_duration || 2;
    const durationWord = numberToWords(duration).toUpperCase();

    const nonCompeteText =
      `Covenant Against Competition. ` +
      `During the term of this Agreement and for ${durationWord} (${duration}) years following termination as a Shareholder, Officer and/or employee of the Corporation (the "Restrictive Period"), no Shareholder shall directly or indirectly, individually or on behalf of any Person other than the Corporation or any affiliate or subsidiary of the Corporation: ` +
      `(i) solicit any Customers of the Corporation for the purpose of selling to them products or services competitive with the products or services sold by the Corporation; ` +
      `(ii) provide directly or indirectly products, services, or assist anyone to provide the products or services of the type provided by the Corporation during the term of this Agreement, to any Person (other than the Corporation) which is then engaged within the Territory in a business similar to the Corporation's Business; or ` +
      `(iii) solicit or induce, or in any manner attempt to solicit or induce, any person employed by the Corporation to leave such employment, whether or not such employment is pursuant to a written contract with the Corporation or is at-will. ` +
      `The Shareholder's obligations under this paragraph shall survive any expiration or termination of this Agreement. As used herein, the term "Territory" means ${answers.noncompete_scope ? answers.noncompete_scope : "anywhere in the United States where the Corporation has Customers"}. As used herein, the term "Customers" means all Persons that have conducted business with the Corporation during the three (3) year period immediately prior to any termination or expiration of this Agreement.`;

    // Find the last Article 10 section number that exists as a standalone
    // <w:t> content — same reliable pattern the old code used (">10.9<"),
    // now dynamically discovered instead of hardcoded.
    let anchor = -1;
    for (let sub = 15; sub >= 1; sub--) {
      const candidate = xml.lastIndexOf(`>10.${sub}<`);
      if (candidate >= 0) { anchor = candidate; break; }
    }
    if (anchor >= 0) {
      const pEnd = xml.indexOf("</w:p>", anchor);
      if (pEnd >= 0) {
        const corpFmt = extractFormatting(xml, ">10.1<");
        const corpPPr = corpFmt.pPr || '<w:pPr><w:pStyle w:val="Heading3"/><w:jc w:val="both"/><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>';
        const corpRPr = corpFmt.rPr || '<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
        const insertPoint = pEnd + "</w:p>".length;
        const ncParagraph = buildFormattedParagraph(nonCompeteText, corpPPr, corpRPr);
        xml = xml.substring(0, insertPoint) + ncParagraph + xml.substring(insertPoint);
      }
    }
  }

  return xml;
}

// ─── §13 Orphan-(c) → "Notice of Election to Sell" subsection ────────

/**
 * The Corp template ships an orphan "(c) In the event that a Shareholder has
 * elected to sell its Shares …" paragraph in Article XIII with no preceding
 * (a) or (b). The body describes a *pre-offer* obligation (90-day advanced
 * notice when a Shareholder decides to sell) — semantically distinct from
 * §13.2 Offer (offer mechanics) and §13.3 Concurrence or Acceptance
 * (post-offer response). Promote it to its own Heading3-styled subsection
 * titled "Notice of Election to Sell" so renumberAndRemapSubsections (branch
 * c, inline-titled) assigns the next §13.X number automatically.
 *
 * Must run AFTER removeCorpConditionalSections (no-op when ROFR=false since
 * the orphan paragraph has been removed) and BEFORE renumberAndRemapSubsections.
 */
function promoteCorpOrphanElectionToSell(xml: string): string {
  const anchor = "In the event that a Shareholder has elected to sell its Shares";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  const para = xml.substring(pStart, pEnd);
  // Idempotent: bail if the paragraph carries neither the paren-form "(c)"
  // (pre-canonicalize state) nor the bare-form "C." (post-canonicalize state).
  // If neither label is present, this paragraph has already been promoted.
  const hasOrphanLabel =
    /<w:t[^>]*>\(c\)<\/w:t>/.test(para) || /<w:t[^>]*>C\.<\/w:t>/.test(para);
  if (!hasOrphanLabel) return xml;

  // Extract the body text — the long <w:t> run starting at the anchor.
  const bodyMatch = para.match(
    /<w:t xml:space="preserve">In the event that a Shareholder has elected to sell its Shares([^<]*)<\/w:t>/,
  );
  if (!bodyMatch) return xml;
  const bodyTail = bodyMatch[1].trimEnd(); // strip trailing whitespace

  // Mirror §13.2 Offer's pPr so this paragraph reads as a Heading3 subsection.
  const ppr =
    "<w:pPr>" +
    "<w:keepNext/>" +
    '<w:pStyle w:val="Heading3"/>' +
    "<w:tabs>" +
    '<w:tab w:val="left" w:leader="none" w:pos="720"/>' +
    "</w:tabs>" +
    '<w:ind w:left="1440" w:hanging="1440"/>' +
    '<w:jc w:val="both"/>' +
    "<w:rPr>" +
    '<w:vertAlign w:val="baseline"/>' +
    "</w:rPr>" +
    "</w:pPr>";
  const titleRun =
    "<w:r>" +
    '<w:rPr><w:u w:val="single"/><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">Notice of Election to Sell</w:t>' +
    "</w:r>";
  const bodyRun =
    "<w:r>" +
    '<w:rPr><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    `<w:t xml:space="preserve">.  In the event that a Shareholder has elected to sell its Shares${bodyTail}</w:t>` +
    "</w:r>";
  const newPara = `<w:p>${ppr}${titleRun}${bodyRun}</w:p>`;

  return xml.substring(0, pStart) + newPara + xml.substring(pEnd);
}

// ─── §13.6 Drag/Tag Along letter-label normalization ─────────────────

/**
 * Drag Along ships with paren-roman label "(i)". It's a first-level sub-item
 * under §13.6 Approved Sale — convention at that depth is letters (cf. §8.1
 * A.–E., §8.4 A.–C., §10.2 A.–G.); romans are reserved for second level (cf.
 * §4.1 B. → i. Voting / ii. Dividends). Rewrite "(i)" → "(a)" and let
 * normalizeListParagraphs canonicalize to "A." with the proper letter indent.
 */
function relabelDragAlong(xml: string): string {
  const anchor = "Drag Along ";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;
  const para = xml.substring(pStart, pEnd);

  // Idempotent: bail if already rewritten.
  if (!/<w:t[^>]*>\(i\)<\/w:t>/.test(para)) return xml;

  const rebuilt = para.replace(/(<w:t[^>]*>)\(i\)(<\/w:t>)/, "$1(a)$2");
  return xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
}

/**
 * §13.5's lone "If a Bona Fide Offer …" sub-item ships with paren-roman
 * label "(i)" inline-glued to the body in a single <w:t>. It's a second-
 * level item under §13.5, so should be a letter (single A.). Rewrite
 * "(i)" → "(a)" and let normalizeListParagraphs canonicalize to A. with
 * the proper letter indent.
 */
function relabelBonaFideOfferItem(xml: string): string {
  // Anchor on the unique inline phrase. Replace the leading "(i)" with "(a)"
  // in the same <w:t> run.
  const before = "(i)     If a Bona Fide Offer";
  const after = "(a)     If a Bona Fide Offer";
  if (xml.indexOf(before) < 0) return xml;
  return xml.replace(before, after);
}

/**
 * §10.6 Non-Disclosure ships with four sub-items mislabeled as level-3
 * romans (i)/(ii)/(iii)/(iv). They sit one level below the Heading3, so
 * by convention (1.N → A. → i.) should be (a)/(b)/(c)/(d). Rewrite
 * scoped to §10.6 — bounded at "Non-Disclosure" → next Heading3
 * ("Non-Disparagement" or, if Non-Disparagement was removed, "Covenant
 * Against Competition" or "ARTICLE XI:").
 */
function relabelNonDisclosureSubitems(xml: string): string {
  const sectionStart = xml.indexOf("Non-Disclosure");
  if (sectionStart < 0) return xml;
  let sectionEnd = xml.indexOf("Non-Disparagement", sectionStart);
  if (sectionEnd < 0) sectionEnd = xml.indexOf("Covenant Against Competition", sectionStart);
  if (sectionEnd < 0) sectionEnd = xml.indexOf("ARTICLE XI:", sectionStart);
  if (sectionEnd < 0) return xml;

  const before = xml.substring(0, sectionStart);
  let middle = xml.substring(sectionStart, sectionEnd);
  const after = xml.substring(sectionEnd);

  // Each label appears once as a standalone <w:t> — replace one-shot.
  middle = middle.replace(/<w:t([^>]*)>\(i\)<\/w:t>/, '<w:t$1>(a)</w:t>');
  middle = middle.replace(/<w:t([^>]*)>\(ii\)<\/w:t>/, '<w:t$1>(b)</w:t>');
  middle = middle.replace(/<w:t([^>]*)>\(iii\)<\/w:t>/, '<w:t$1>(c)</w:t>');
  middle = middle.replace(/<w:t([^>]*)>\(iv\)<\/w:t>/, '<w:t$1>(d)</w:t>');

  return before + middle + after;
}

/**
 * Tag Along ships with no label. Prepend a "(b)" paren-letter label run
 * before the italic title; normalizeListParagraphs canonicalizes to "B."
 * with the proper letter indent.
 */
function addTagAlongLabel(xml: string): string {
  const anchor = "Tag Along";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;
  const para = xml.substring(pStart, pEnd);

  // Idempotent: bail if already labeled with either A. or B.
  if (
    /<w:t[^>]*>\(a\)<\/w:t>/.test(para) ||
    /<w:t[^>]*>\(b\)<\/w:t>/.test(para) ||
    /<w:t[^>]*>A\.<\/w:t>/.test(para) ||
    /<w:t[^>]*>B\.<\/w:t>/.test(para)
  ) {
    return xml;
  }
  // Sanity: only act on the actual Tag Along *title* paragraph.
  if (!/<w:t[^>]*>Tag Along [–-] <\/w:t>/.test(para)) return xml;

  // Choose label dynamically: if Drag Along is also present in the doc,
  // Tag Along is the SECOND letter sub-item under §13.6 ("(b)" → B.).
  // If Drag Along was removed (drag_along=false but tag_along=true), Tag
  // Along is the ONLY letter sub-item, so it's "(a)" → A.
  const hasDragAlong = xml.includes("Drag Along");
  const label = hasDragAlong ? "(b)" : "(a)";

  const labelRun =
    "<w:r>" +
    '<w:rPr><w:color w:val="000000"/><w:u w:val="none"/><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    `<w:t xml:space="preserve">${label}</w:t>` +
    "</w:r>";

  // Insert label run before the first <w:r> in the paragraph.
  let rebuilt = para.replace(/(<\/w:pPr>)([\s\S]*?)(<w:r\b)/, `$1$2${labelRun}$3`);
  // Mirror Drag Along's "<w:t> Drag Along – </w:t>" leading space so post-tab
  // rendering ("B.<tab> Tag Along") matches ("A.<tab> Drag Along").
  rebuilt = rebuilt.replace(
    /(<w:t xml:space="preserve">)Tag Along ([–-] <\/w:t>)/,
    "$1 Tag Along $2",
  );
  return xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
}

// ─── §13.6 "Approved Sale" heading injection ─────────────────────────

/**
 * The Drag-Along / Tag-Along umbrella paragraph in Article XIII ships
 * titleless: "In the event that Shareholders holding at least 50.1% of
 * the Shares desire to sell the entirety of their Shares to a third
 * party … and such sale has been Approved (the 'Approved Sale') …".
 * The body itself names the defined term "Approved Sale", so use that
 * as the section title. Prepend an underlined title run + period so
 * branch (c) of renumberAndRemapSubsections picks it up.
 */
function addApprovedSaleHeading(xml: string): string {
  // Anchor must live entirely within one <w:t> run. Template ships "In" in a
  // separate run from "the event that …", so anchor on the second run.
  const anchor = "the event that Shareholders holding at least 50.1%";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  const para = xml.substring(pStart, pEnd);
  // Idempotent: if the paragraph already starts with an underlined "Approved Sale"
  // run, skip.
  if (/<w:t[^>]*>Approved Sale<\/w:t>/.test(para.substring(0, 800))) return xml;

  // Replace the existing pPr with a clean Heading3 pPr (mirrors §13.2 Offer's).
  const newPPr =
    "<w:pPr>" +
    "<w:keepNext/>" +
    '<w:pStyle w:val="Heading3"/>' +
    "<w:tabs>" +
    '<w:tab w:val="left" w:leader="none" w:pos="720"/>' +
    "</w:tabs>" +
    '<w:ind w:left="1440" w:hanging="1440"/>' +
    '<w:jc w:val="both"/>' +
    "<w:rPr>" +
    '<w:vertAlign w:val="baseline"/>' +
    "</w:rPr>" +
    "</w:pPr>";
  const titleRun =
    "<w:r>" +
    '<w:rPr><w:u w:val="single"/><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">Approved Sale</w:t>' +
    "</w:r>";
  const periodRun =
    "<w:r>" +
    '<w:rPr><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">.  </w:t>' +
    "</w:r>";

  // Replace the existing <w:pPr>…</w:pPr>, then insert the new title + period
  // runs immediately before the first existing <w:r>.
  let rebuilt = para.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, newPPr);
  rebuilt = rebuilt.replace(
    /(<\/w:pPr>)([\s\S]*?)(<w:r\b)/,
    `$1$2${titleRun}${periodRun}$3`,
  );

  return xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
}

// ─── §13.1 Right of First Refusal — add intro body ───────────────────

/**
 * §13.1 ships as a bare Heading3 with no body — just "Right of First Refusal."
 * Visually broken when §13.2-§13.6 below all have substantive content.
 * Plus the template's run structure (stray <w:tab/> in run[0], underlined
 * "13.1 Right of First Refusal." in run[1]) trips up standardizeNumbered-
 * HeadingShape because its first <w:t> check finds no text in run[0].
 *
 * Replace the entire paragraph with a clean branch-(c) shape:
 *   underlined "Right of First Refusal" + ".  [intro sentence]"
 * renumberAndRemapSubsections then prepends "13.1 " as a non-underlined
 * leading run.
 */
function addRofrIntroBody(xml: string): string {
  const anchor = "Right of First Refusal";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  const para = xml.substring(pStart, pEnd);
  const text = (para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("");
  // Idempotent: if the paragraph already carries body text (>50 chars
  // beyond the title+period), assume already fixed.
  if (text.length > 50) return xml;

  const ppr =
    "<w:pPr>" +
    "<w:keepNext/>" +
    '<w:pStyle w:val="Heading3"/>' +
    "<w:tabs>" +
    '<w:tab w:val="left" w:leader="none" w:pos="720"/>' +
    "</w:tabs>" +
    '<w:ind w:left="1440" w:hanging="1440"/>' +
    '<w:jc w:val="both"/>' +
    "<w:rPr>" +
    '<w:vertAlign w:val="baseline"/>' +
    "</w:rPr>" +
    "</w:pPr>";
  const titleRun =
    "<w:r>" +
    '<w:rPr><w:u w:val="single"/><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">Right of First Refusal</w:t>' +
    "</w:r>";
  const bodyText =
    "Before any Shareholder may transfer all or any portion of his Shares, the Shares must first be offered to the other Shareholders pursuant to the procedures set forth below.";
  const bodyRun =
    "<w:r>" +
    '<w:rPr><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    `<w:t xml:space="preserve">.  ${bodyText}</w:t>` +
    "</w:r>";
  const newPara = `<w:p>${ppr}${titleRun}${bodyRun}</w:p>`;
  return xml.substring(0, pStart) + newPara + xml.substring(pEnd);
}

// ─── §13.3 Notice of Proposed Transfer (promoted from body para) ─────

/**
 * The "The Transferor shall deliver a notice of the proposed transfer …"
 * paragraph sits between §13.2 Offer and §13.3 Concurrence as unlabeled
 * body text. The user wants it to be its own subsection. Promote to
 * Heading3 inline-titled shape so renumber assigns §13.3.
 */
function promoteTransferorNoticeSection(xml: string): string {
  const anchor = "The Transferor shall deliver a notice of the proposed transfer";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  const para = xml.substring(pStart, pEnd);
  // Idempotent: if a "Notice of Proposed Transfer" title already exists in
  // this paragraph, skip.
  if (/<w:t[^>]*>Notice of Proposed Transfer<\/w:t>/.test(para)) return xml;

  // Extract body text — the long body run that includes "The Transferor …".
  // The template ships this paragraph with weird leading whitespace + tabs.
  // Concatenate all <w:t> contents and strip leading whitespace.
  const allText = (para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/^\s+/, "");
  if (!allText) return xml;

  const ppr =
    "<w:pPr>" +
    "<w:keepNext/>" +
    '<w:pStyle w:val="Heading3"/>' +
    "<w:tabs>" +
    '<w:tab w:val="left" w:leader="none" w:pos="720"/>' +
    "</w:tabs>" +
    '<w:ind w:left="1440" w:hanging="1440"/>' +
    '<w:jc w:val="both"/>' +
    "<w:rPr>" +
    '<w:vertAlign w:val="baseline"/>' +
    "</w:rPr>" +
    "</w:pPr>";
  const titleRun =
    "<w:r>" +
    '<w:rPr><w:u w:val="single"/><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">Notice of Proposed Transfer</w:t>' +
    "</w:r>";
  const bodyRun =
    "<w:r>" +
    '<w:rPr><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    `<w:t xml:space="preserve">.  ${allText}</w:t>` +
    "</w:r>";
  const newPara = `<w:p>${ppr}${titleRun}${bodyRun}</w:p>`;
  return xml.substring(0, pStart) + newPara + xml.substring(pEnd);
}

// ─── §14.7 continuation paragraph indent fix ─────────────────────────

/**
 * §14.7 Payment Upon Withdrawal has TWO body paragraphs:
 *   (1) "If the Corporation purchases…" — properly indented with the
 *       Heading3 left=1440/hanging=1440 layout.
 *   (2) "If the Corporation fails to notify the Divorcing Shareholder…" —
 *       template ships left=1420 hanging=656 (Google Docs export quirk).
 *       First line indents to ~0.53" while body wraps at ~0.99", so
 *       visually the second paragraph "steps in" inconsistently from
 *       the first.
 * Fix: replace the second paragraph's indent with left=1440 (no hanging,
 * no firstLine) so all lines flush at 1" and the paragraph reads as a
 * clean continuation of §14.7's body.
 */
function normalize147ContinuationIndent(xml: string): string {
  const anchor =
    "If the Corporation fails to notify the Divorcing Shareholder";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  const para = xml.substring(pStart, pEnd);
  const fixed = para.replace(
    /<w:ind\s+[^/]*\/>/,
    '<w:ind w:left="1440"/>',
  );
  if (fixed === para) return xml;
  return xml.substring(0, pStart) + fixed + xml.substring(pEnd);
}

// ─── §10.6 Officers + §10.7 Banking heading repair ───────────────────

/**
 * The template's "Officers" subsection ships with a leading whitespace-only
 * <w:r> ("     ") before the underlined "Officers" run. branch (c) of
 * renumberAndRemapSubsections looks at the FIRST <w:r> in the paragraph and
 * checks for underline — it sees the whitespace run, fails the check, and
 * the section never gets a §X.Y prefix. Strip the whitespace run so the
 * underlined title becomes the first run.
 */
function stripLeadingWhitespaceFromOfficersHeading(xml: string): string {
  const anchor = "Each Officer shall be appointed";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;
  const para = xml.substring(pStart, pEnd);

  // Match the structure: [<w:r>...<w:t>whitespace</w:t></w:r>] before the
  // underlined "Officers" title run. Drop the whitespace run.
  const rebuilt = para.replace(
    /(<\/w:pPr>)<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>\s+<\/w:t><\/w:r>(\s*<w:r\b[^>]*><w:rPr>[\s\S]*?<w:u w:val="single"\/>)/,
    "$1$2",
  );
  if (rebuilt === para) return xml;
  return xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
}

/**
 * The template's banking subsection ("All funds of the Corporation shall
 * be deposited …") ships with NO title — just body text. Prepend an
 * underlined "Banking" title + ".  " separator so it becomes a branch-(c)
 * heading and renumberAndRemapSubsections assigns it the next §X.Y slot.
 */
function addBankingHeading(xml: string): string {
  const anchor = "All funds of the Corporation shall be deposited";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;
  const para = xml.substring(pStart, pEnd);

  // Idempotent: if the para already starts with an underlined "Banking" run,
  // don't re-add it.
  if (/<w:t[^>]*>Banking<\/w:t>/.test(para.substring(0, 800))) return xml;

  // Replace pPr with a Heading3 pPr (mirrors §13.2 Offer's shape).
  const newPPr =
    "<w:pPr>" +
    "<w:keepNext/>" +
    '<w:pStyle w:val="Heading3"/>' +
    "<w:tabs>" +
    '<w:tab w:val="left" w:leader="none" w:pos="720"/>' +
    "</w:tabs>" +
    '<w:ind w:left="1440" w:hanging="1440"/>' +
    '<w:jc w:val="both"/>' +
    "<w:rPr>" +
    '<w:vertAlign w:val="baseline"/>' +
    "</w:rPr>" +
    "</w:pPr>";
  const titleRun =
    "<w:r>" +
    '<w:rPr><w:u w:val="single"/><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">Banking</w:t>' +
    "</w:r>";
  const periodRun =
    "<w:r>" +
    '<w:rPr><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">.  </w:t>' +
    "</w:r>";

  let rebuilt = para.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, newPPr);
  rebuilt = rebuilt.replace(
    /(<\/w:pPr>)([\s\S]*?)(<w:r\b)/,
    `$1$2${titleRun}${periodRun}$3`,
  );
  return xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
}

// ─── §13 inline-title period normalization ───────────────────────────

/**
 * The Corp template's "Purchase of Shareholder Interests upon Deadlock."
 * paragraph has the period glued INSIDE the underlined title run, with the
 * body run starting at "  In the event …". renumberAndRemapSubsections's
 * branch (c) detector requires the period to be at the start of the BODY
 * run (so the title alone is the underlined caption). Move the period.
 *
 * Same shape problem will likely recur on other paragraphs; do a generic
 * pass over every paragraph whose first run is underlined and ends in ".".
 */
function normalizeInlineTitlePeriod(xml: string): string {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
    // Need at least two <w:r> runs.
    const runs = [...para.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)];
    if (runs.length < 2) return para;

    const firstRun = runs[0][0];
    if (!/<w:u w:val="single"\/>/.test(firstRun)) return para;

    const firstTexts = (firstRun.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("");
    if (!firstTexts.endsWith(".") || firstTexts.length < 4) return para;
    if (/^\d/.test(firstTexts)) return para; // already has N.M prefix

    // Body run (next run with substantive text) — its first <w:t> should NOT
    // already start with "." (else the pattern is fine).
    let bodyRunIdx = -1;
    for (let i = 1; i < runs.length; i++) {
      const txt = (runs[i][0].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
        .map((t) => t.replace(/<[^>]+>/g, ""))
        .join("");
      if (txt.trim()) {
        bodyRunIdx = i;
        // If body already starts with ".", nothing to fix.
        if (/^\s*\./.test(txt)) return para;
        break;
      }
    }
    if (bodyRunIdx < 0) return para;

    // Strip the trailing "." from the LAST <w:t> of the first run.
    const newFirstRun = firstRun.replace(
      /(<w:t[^>]*>[^<]*?)\.(<\/w:t>)(?![\s\S]*<w:t)/,
      "$1$2",
    );
    if (newFirstRun === firstRun) return para;

    // Prepend "." to the first <w:t> of the body run.
    const oldBodyRun = runs[bodyRunIdx][0];
    const newBodyRun = oldBodyRun.replace(
      /<w:t([^>]*)>/,
      `<w:t xml:space="preserve">.</w:t><w:t$1>`,
    );
    if (newBodyRun === oldBodyRun) return para;

    return para.replace(firstRun, newFirstRun).replace(oldBodyRun, newBodyRun);
  });
}

// ─── Tab Normalization ───────────────────────────────────────────────

/**
 * Normalize tab stops for sub-items to ensure consistent indentation:
 * - (i), (ii), (iii) roman numeral items → left indent 1440 twips (1 inch)
 * - A., B., C. lettered items → left indent 720 twips (0.5 inch)
 *
 * The attorney's templates have inconsistent indentation on these items.
 * This normalizes them all to use the same tab positions.
 */
function normalizeSubItemTabs(xml: string): string {
  return xml.replace(/<w:p([ >][\s\S]*?)<\/w:p>/g, (fullMatch, inner) => {
    const texts = (fullMatch.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t: string) => t.replace(/<[^>]+>/g, "")).join("").trim();

    // Check if this is a roman numeral sub-item: (i), (ii), (iii), (iv), (v), (vi)
    const isRoman = /^\((?:i{1,3}|iv|v|vi)\)\s*/.test(texts);
    // Check if this is a lettered sub-item: A., B., C.
    const isLetter = /^[A-C]\.\s/.test(texts);

    if (!isRoman && !isLetter) return fullMatch;

    const targetLeft = isRoman ? "1440" : "720";  // 1 inch for romans, 0.5 inch for letters
    const targetFirstLine = "0";

    // If paragraph has pPr with ind, normalize it
    if (fullMatch.includes("<w:pPr>")) {
      // Replace or add w:ind within existing pPr
      if (fullMatch.includes("<w:ind ")) {
        return fullMatch.replace(
          /<w:ind [^/]*\/>/,
          `<w:ind w:left="${targetLeft}" w:firstLine="${targetFirstLine}"/>`
        );
      } else {
        return fullMatch.replace(
          "<w:pPr>",
          `<w:pPr><w:ind w:left="${targetLeft}" w:firstLine="${targetFirstLine}"/>`
        );
      }
    } else if (fullMatch.includes("<w:p>")) {
      return fullMatch.replace(
        "<w:p>",
        `<w:p><w:pPr><w:ind w:left="${targetLeft}" w:firstLine="${targetFirstLine}"/></w:pPr>`
      );
    }

    return fullMatch;
  });
}

// ─── Section Number Tab Normalization ────────────────────────────────

/**
 * Normalize indentation and tab stops on all numbered-section heading paragraphs
 * so that titles align at the same horizontal position regardless of the section
 * number's width. The Corp template has per-paragraph w:left values ranging from
 * 706 to 787 twips and inconsistent use of w:hanging vs w:firstLine, which makes
 * "1.8 Officers" and "1.10 Share or Shares" end up at slightly different columns.
 *
 * Heuristic: a "numbered section heading" is any paragraph whose first <w:t> run
 * is exactly a "N.M" (digit.digit(s)) pattern and is immediately followed by a
 * <w:tab/>. We skip paragraphs whose pStyle is Heading4 (those are list items
 * like §15.11 with complex multi-tab layouts).
 */
function normalizeSectionNumberTabs(xml: string): string {
  return xml.replace(/<w:p([ >][\s\S]*?)<\/w:p>/g, (fullMatch) => {
    // Is the first <w:t> in this paragraph a "N.M" pattern?
    // Two shapes the template uses for numbered headings:
    //   Article I style:   <w:t>1.8</w:t><w:tab/>...<w:t>Officers</w:t>
    //   Article II style:  <w:t>2.1 Articles</w:t>...<w:tab/>...<w:t>The Articles...</w:t>
    // We match both: first <w:t> starts with "N.M" (optionally followed by text).
    const firstT = fullMatch.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
    if (!firstT) return fullMatch;
    const firstTxt = firstT[1];
    const numMatch = firstTxt.match(/^(\d+\.\d+)(?:\s|$)/);
    if (!numMatch) return fullMatch;

    // Skip Heading4 (list-style paragraphs with many tab stops, e.g. §15.11)
    if (/<w:pStyle w:val="Heading4"\/>/.test(fullMatch)) return fullMatch;

    // Target layout for numbered section headings:
    //   Number at left margin (column 0), title at 720 twips (0.5"),
    //   body text inline, wrap at 1440 twips (1.0") — matching the body
    //   wrap position used by unnumbered Heading3 paragraphs (Commencement,
    //   Dissolution, Authorized Shares, etc.) which use w:left="1440".
    // Achieved via w:hanging=1440 so the first line starts at 0 while the
    // wrap indent stays at 1440.
    const newInd = `<w:ind w:left="1440" w:hanging="1440"/>`;
    const newTabs = `<w:tabs><w:tab w:val="left" w:leader="none" w:pos="720"/></w:tabs>`;

    let result = fullMatch;

    if (result.includes("<w:pPr>")) {
      // Replace existing <w:ind .../>
      if (/<w:ind [^/]*\/>/.test(result)) {
        result = result.replace(/<w:ind [^/]*\/>/, newInd);
      } else {
        result = result.replace("<w:pPr>", `<w:pPr>${newInd}`);
      }
      // Replace existing <w:tabs>...</w:tabs>
      if (/<w:tabs>[\s\S]*?<\/w:tabs>/.test(result)) {
        result = result.replace(/<w:tabs>[\s\S]*?<\/w:tabs>/, newTabs);
      } else {
        result = result.replace("<w:pPr>", `<w:pPr>${newTabs}`);
      }
    } else {
      // Paragraph has no pPr — add one with both ind and tabs
      result = result.replace(
        /(<w:p\b[^>]*>)/,
        `$1<w:pPr>${newTabs}${newInd}</w:pPr>`,
      );
    }

    return result;
  });
}

// ─── Corp Super Majority Insertion ───────────────────────────────────

/**
 * Insert a new "1.7 Super Majority" paragraph immediately after the 1.6 Majority
 * paragraph. Clones the 1.6 paragraph's <w:pPr> and run structure (number +
 * <w:tab/> + underlined title + period + <w:tab/> + body) so formatting matches.
 *
 * Must run AFTER cascadeRenumberCorpArticleI has bumped 1.7..1.10 → 1.8..1.11,
 * so this new paragraph slots into the now-vacant 1.7 position.
 */
function insertSuperMajorityCorp(xml: string, supText: string): string {
  // Find the 1.6 paragraph by locating the <w:t>1.6</w:t><w:tab/> marker
  const marker = xml.match(/<w:t[^>]*>1\.6<\/w:t>\s*<w:tab\/>/);
  if (!marker || marker.index === undefined) return xml;

  const pStart = paragraphStartBefore(xml, marker.index);
  const pCloseIdx = xml.indexOf("</w:p>", marker.index);
  if (pStart < 0 || pCloseIdx < 0) return xml;
  const pEnd = pCloseIdx + "</w:p>".length;

  const majPara = xml.substring(pStart, pEnd);
  const pPrMatch = majPara.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "<w:pPr/>";

  // Build a new paragraph with the same pPr. Runs:
  //   [run: "1.7" + <w:tab/>]
  //   [underlined run: "Super Majority"]
  //   [run: ".  " + body + final period + <w:tab/> is NOT needed since body is inline]
  const newPara =
    `<w:p>${pPr}` +
    `<w:r><w:rPr><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>` +
    `<w:t xml:space="preserve">1.7</w:t><w:tab/></w:r>` +
    `<w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>` +
    `<w:t xml:space="preserve">Super Majority</w:t></w:r>` +
    `<w:r><w:rPr><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>` +
    `<w:t xml:space="preserve">.</w:t><w:tab/>` +
    `<w:t xml:space="preserve">Shareholders collectively holding greater than ${supText} of the Percentage Interests of all the Shareholders eligible to vote.</w:t>` +
    `</w:r></w:p>`;

  // Insert an empty separator paragraph BEFORE §1.7 so the visual spacing
  // between §1.6 Majority and §1.7 Super Majority matches every other
  // intra-Article-I section break (§1.5→§1.6, §1.7→§1.8, etc., all of
  // which ship with an empty separator paragraph between them).
  const sepPara = `<w:p>${pPr}</w:p>`;
  return xml.substring(0, pEnd) + sepPara + newPara + xml.substring(pEnd);
}

/**
 * Ensure every pair of consecutive numbered §X.Y heading paragraphs in
 * the same Article has an empty separator paragraph between them. The
 * Corp template ships with §1.1 / §1.2 directly adjacent (and in some
 * variants other pairs too), breaking the visual rhythm where every
 * other section pair has a separator. Walk the document; for each pair
 * of adjacent non-empty Heading3 paragraphs in the same article (same
 * major number), insert an empty paragraph cloned from the previous
 * one's pPr.
 */
function ensureSeparatorsBetweenHeadings(xml: string): string {
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  type Span = { start: number; end: number; full: string; text: string };
  const paras: Span[] = [];
  let m;
  while ((m = paraRe.exec(xml))) {
    const text = (m[1].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    paras.push({ start: m.index, end: m.index + m[0].length, full: m[0], text });
  }

  // Match "N.M" at start of paragraph text. At this pipeline stage some
  // paragraphs still have number+title concatenated with no space (Shape B
  // before standardizeNumberedHeadingShape splits it), so we don't require
  // whitespace after the number — just digits.dot.digits at start.
  const SEC = /^(\d+)\.(\d+)(?=\D|$)/;
  const insertions: Array<{ at: number; html: string }> = [];
  for (let i = 0; i < paras.length - 1; i++) {
    const cur = paras[i];
    const nxt = paras[i + 1];
    if (!cur.text || !nxt.text) continue;
    const a = cur.text.match(SEC);
    const b = nxt.text.match(SEC);
    if (!a || !b) continue;
    if (a[1] !== b[1]) continue; // different article
    // Adjacent §X.Y headings with no empty between — insert separator.
    const pPrMatch = cur.full.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[0] : "<w:pPr/>";
    insertions.push({ at: cur.end, html: `<w:p>${pPr}</w:p>` });
  }
  if (insertions.length === 0) return xml;
  // Apply in REVERSE so earlier offsets stay valid.
  insertions.sort((a, b) => b.at - a.at);
  for (const ins of insertions) {
    xml = xml.substring(0, ins.at) + ins.html + xml.substring(ins.at);
  }
  return xml;
}

// ─── Corp Article I Cascade Renumber ─────────────────────────────────

/**
 * Renumber all Article I section headings whose number is >= `fromN` by +1.
 * E.g. with fromN=7: 1.7 Officers → 1.8, 1.8 Percentage Interest → 1.9,
 * 1.9 Share or Shares → 1.10, 1.10 Successor → 1.11. Processes in reverse
 * order to avoid collisions (renumbering 1.9 → 1.10 before 1.10 → 1.11 would
 * create two 1.10s temporarily).
 *
 * A "section heading" is a paragraph whose first <w:t> run is exactly "1.N"
 * followed by <w:tab/>. This intentionally skips body text like "1.5(a)" that
 * might appear in later prose.
 */
function cascadeRenumberCorpArticleI(xml: string, fromN: number): string {
  const paraRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  type Entry = { idx: number; para: string; n: number };
  const entries: Entry[] = [];
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(xml)) !== null) {
    const para = m[0];
    const first = para.match(/<w:t[^>]*>1\.(\d+)<\/w:t>\s*<w:tab\/>/);
    if (first) {
      const n = parseInt(first[1], 10);
      if (n >= fromN) entries.push({ idx: m.index, para, n });
    }
  }
  // Process largest n first
  entries.sort((a, b) => b.n - a.n);
  for (const { para, n } of entries) {
    const newN = n + 1;
    const newPara = para.replace(
      new RegExp(`(<w:t[^>]*>)1\\.${n}(</w:t>\\s*<w:tab\\/>)`),
      `$11.${newN}$2`,
    );
    if (newPara !== para) {
      xml = xml.replace(para, newPara);
    }
  }
  return xml;
}

// ─── Normalize letter/roman list paragraphs ─────────────────────────

/**
 * The Corp template's lettered (A./B./C./D.) and roman-numeral (i./ii./iii.)
 * list items inherit messy indents from the Google Docs export — each
 * paragraph has slightly different `<w:ind>` values (left=1406 vs 1427 vs
 * 1440, sometimes with firstLine=720, sometimes hanging=184), and the
 * leading run is padded with stray `<w:t> </w:t>` spaces and duplicated
 * `<w:tab/>` elements. Visual result: A. and B. don't align in the same
 * column, and i./ii. wrap text returns to the page margin instead of
 * staying under the body.
 *
 * For each paragraph whose first non-whitespace text run is a single
 * `[A-F].` (letter list) or `i./ii./iii./.../x.` (roman list):
 *   1. Replace `<w:pPr>` with a clean hanging-indent (letter: left=2160
 *      hanging=720; roman: left=2880 hanging=720). This puts the label
 *      at a fixed column and wraps body text under the body, not at the
 *      margin.
 *   2. In the run that contains the label, strip everything BEFORE the
 *      label `<w:t>` and replace with a single `<w:tab/>`. Preserve the
 *      run's `<w:rPr>` (bold etc.) and the trailing `<w:tab/>` that
 *      separates label from body.
 *
 * Intentionally surgical: only touches paragraphs whose label `<w:t>` is
 * exactly one of the expected forms. Doesn't merge runs or touch
 * underlined "Voting"/"Dividends" labels in subsequent runs.
 */
function normalizeListParagraphs(xml: string): string {
  const LETTER_PPR =
    '<w:pPr>' +
    '<w:keepLines w:val="1"/>' +
    '<w:widowControl w:val="1"/>' +
    '<w:spacing w:after="115" w:before="0" w:line="240" w:lineRule="auto"/>' +
    '<w:ind w:left="2160" w:hanging="720"/>' +
    '<w:jc w:val="both"/>' +
    '<w:rPr>' +
    '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/><w:vertAlign w:val="baseline"/>' +
    '</w:rPr>' +
    '</w:pPr>';
  const ROMAN_PPR = LETTER_PPR.replace(
    'w:left="2160" w:hanging="720"',
    'w:left="2880" w:hanging="720"',
  );

  // Two-level hierarchy:
  //   Letter:  A./B./.../Z. — column 1440, body 2160
  //   Roman:   i./ii./.../x. — column 2160, body 2880
  // Paren-form labels (a)/(b)/(i)/(ii) get rewritten to bare form (A./B./i./ii.)
  // so the doc uses one consistent label style. Single-char paren disambig:
  //   (i)/(v)/(x) → romans (i./v./x.)
  //   any other (a)/(b).../(z) → letter (uppercased + period)
  const ROMAN_PAREN = '(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)';
  const LETTER_RE = new RegExp(`^([A-Z]\\.|\\([a-hjklmnopqrstuwyz]\\))$`);
  const ROMAN_RE = new RegExp(`^(?:(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\\.|\\(${ROMAN_PAREN}\\))$`);
  const LETTER_PREFIX_RE = new RegExp(`^\\s*([A-Z]\\.|\\([a-hjklmnopqrstuwyz]\\))(\\s+|$)([\\s\\S]*)$`);
  const ROMAN_PREFIX_RE = new RegExp(`^\\s*((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\\.|\\(${ROMAN_PAREN}\\))(\\s+|$)([\\s\\S]*)$`);

  // Rewrite paren-form labels to bare form.
  const canonicalize = (raw: string): string => {
    if (/^\([a-z]\)$/.test(raw)) {
      const ch = raw.charAt(1);
      // (i)/(v)/(x) treated as romans by ROMAN_RE; this is letter path so
      // they shouldn't reach here, but be safe.
      if ('ivx'.includes(ch)) return ch + '.';
      return ch.toUpperCase() + '.';
    }
    if (/^\([a-z]+\)$/.test(raw)) return raw.slice(1, -1) + '.';
    return raw;
  };

  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
    const tMatches = [...para.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
    const firstSubstantive = tMatches.find((m) => m[1].trim().length > 0);
    if (!firstSubstantive) return para;

    // Case A: first <w:t> content is JUST the label (label and body are in
    //         separate runs). Detect by trimmed equality.
    // Case B: first <w:t> content is label + spaces + body inline.
    //         Detect by prefix regex; split the <w:t> in two.
    const trimmed = firstSubstantive[1].trim();
    let isLetter = LETTER_RE.test(trimmed);
    let isRoman = ROMAN_RE.test(trimmed);
    let rawLabel = trimmed;
    let combined = false;

    if (!isLetter && !isRoman) {
      const letterMatch = firstSubstantive[1].match(LETTER_PREFIX_RE);
      const romanMatch = firstSubstantive[1].match(ROMAN_PREFIX_RE);
      const m = letterMatch || romanMatch;
      if (!m) return para;
      rawLabel = m[1];
      const body = m[3];
      if (!body.trim()) return para;
      isLetter = !!letterMatch;
      isRoman = !!romanMatch;
      combined = true;
    }
    if (!isLetter && !isRoman) return para;

    const newLabel = canonicalize(rawLabel);

    let out = para;
    if (combined) {
      // Case B: split the original <w:t> into label + body, with the new
      // bare-form label.
      const oldFull = firstSubstantive[0];
      const m = firstSubstantive[1].match(isLetter ? LETTER_PREFIX_RE : ROMAN_PREFIX_RE)!;
      const body = m[3];
      const newContent =
        `<w:t xml:space="preserve">${newLabel}</w:t><w:tab/><w:t xml:space="preserve">${body}</w:t>`;
      out = out.replace(oldFull, newContent);
    } else if (newLabel !== rawLabel) {
      // Case A with paren-form label: rewrite the label <w:t> to bare form.
      // Allow leading/trailing whitespace inside the <w:t> (template often
      // ships "(a) " with a trailing space).
      out = out.replace(
        new RegExp(`(<w:t(?:\\s[^>]*)?>)\\s*${rawLabel.replace(/[()]/g, '\\$&')}\\s*(</w:t>)`),
        `$1${newLabel}$2`,
      );
    }

    // Replace <w:pPr> with the level-appropriate clean indent.
    out = out.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, isRoman ? ROMAN_PPR : LETTER_PPR);

    // Locate the run containing the (now bare-form) label and clean its
    // leading garbage (<w:t> </w:t>, stray <w:tab/>) — preserve <w:rPr>.
    // Match four label-text variants — bare or with trailing space, with
    // or without xml:space attribute. Without the trailing-space match,
    // labels like "<w:t xml:space=\"preserve\">B. </w:t>" (template ships
    // §15.1's B. and C. this way) fail the labelIdx lookup, the leading-
    // tab cleanup is skipped, and B./C. render without the leading tab
    // while sibling D. (no trailing space) does — visible misalignment.
    let labelIdx = -1;
    let labelEnd = -1;
    const candidates = [
      `<w:t xml:space="preserve">${newLabel}</w:t>`,
      `<w:t>${newLabel}</w:t>`,
      `<w:t xml:space="preserve">${newLabel} </w:t>`,
      `<w:t>${newLabel} </w:t>`,
    ];
    for (const c of candidates) {
      const i = out.indexOf(c);
      if (i >= 0) {
        labelIdx = i;
        labelEnd = i + c.length;
        break;
      }
    }
    if (labelIdx < 0) return out;

    const rOpen = out.lastIndexOf("<w:r>", labelIdx);
    const rOpenAttr = out.lastIndexOf("<w:r ", labelIdx);
    const rStart = Math.max(rOpen, rOpenAttr);
    if (rStart < 0) return out;
    const run = out.substring(rStart, labelIdx);
    const openMatch = run.match(/<w:r\b[^>]*>/);
    const openTag = openMatch ? openMatch[0] : "<w:r>";
    const rPrMatch = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    // Always rewrite the label <w:t> to the bare-form (no trailing space)
    // so the post-label structure is uniform.
    const cleanPrefix = `${openTag}${rPr}<w:tab/><w:t xml:space="preserve">${newLabel}</w:t>`;
    out = out.substring(0, rStart) + cleanPrefix + out.substring(labelEnd);
    return out;
  });
}

// ─── §3.2 Dissolution lettering (Corp) ───────────────────────────────

/**
 * The Corp template's §3.2 Dissolution renders three "Event of Dissolution"
 * triggers as unlettered bullets with broken Google Docs export tabs
 * (e.g. `w:left="2165" w:hanging="13"` and 3 stray tab stops at 720/2889/7177).
 * The user wants them as a lettered A./B./C. list matching the §4.1
 * Authorized Shares pattern (which the template renders correctly).
 *
 * Rewrite each bullet's <w:pPr> + leading run to mirror §4.1 A./B.:
 *   <w:pPr><w:ind w:left="1427" w:firstLine="0"/><w:jc w:val="both"/>...</w:pPr>
 *   <w:r>...<w:tab/><w:t>A.</w:t><w:tab/><w:t>{body}</w:t></w:r>
 */
function addDissolutionLettering(xml: string): string {
  const sectionStart = xml.indexOf("3.2 Dissolution");
  if (sectionStart < 0) return xml;
  const sectionEnd = xml.indexOf("Following an Event of Dissolution", sectionStart);
  if (sectionEnd < 0) return xml;

  // Anchors on the body text of the three bullets.
  const bullets: Array<{ anchor: string; letter: string }> = [
    // Anchor without the leading voting word — applyVotingReplacements rewrites
    // "Majority" to "Unanimous"/"Super Majority" before this pass runs.
    { anchor: "election to dissolve by the Shareholders", letter: "A." },
    { anchor: "sale of all or substantially all of the assets", letter: "B." },
    { anchor: "entry of a judicial decree of dissolution", letter: "C." },
  ];

  // Replacement <w:pPr> mirroring §4.1 A./B. (left=1427, firstLine=0, justified).
  // Preserve keepLines/widowControl=1 so the bullet stays whole across pages.
  const cleanPPr =
    '<w:pPr>' +
    '<w:keepLines w:val="1"/>' +
    '<w:widowControl w:val="1"/>' +
    '<w:spacing w:after="115" w:before="0" w:line="240" w:lineRule="auto"/>' +
    '<w:ind w:left="1427" w:firstLine="0"/>' +
    '<w:jc w:val="both"/>' +
    '<w:rPr>' +
    '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
    '<w:vertAlign w:val="baseline"/>' +
    '</w:rPr>' +
    '</w:pPr>';

  for (const { anchor, letter } of bullets) {
    const idx = xml.indexOf(anchor, sectionStart);
    if (idx < 0 || idx > sectionEnd) continue;
    const pStart = xml.lastIndexOf("<w:p ", idx);
    const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
    if (pStart < 0 || pEnd <= pStart) continue;

    const para = xml.substring(pStart, pEnd);

    // Strip the existing <w:pPr> (Google Docs export's broken tabs/indent).
    let rebuilt = para.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, cleanPPr);

    // Prepend "<w:tab/><w:t>A.</w:t><w:tab/>" before the FIRST <w:t> in the
    // FIRST <w:r>. Detect by finding "<w:t" inside the first run.
    rebuilt = rebuilt.replace(
      /(<w:r\b[^>]*>[\s\S]*?<\/w:rPr>)(\s*)(<w:t)/,
      `$1<w:tab/><w:t xml:space="preserve">${letter}</w:t><w:tab/>$3`,
    );

    xml = xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
  }
  return xml;
}

// ─── §7.1 Reimbursable Expenses lettering (Corp) ─────────────────────

/**
 * §7.1 ships two unlabeled sub-paragraphs that follow the Heading3:
 *   "The Corporation shall reimburse the Directors and the Officers …"
 *   "The Corporation shall pay all expenses of the Corporation, including
 *    without limitation:"
 * Both already have the A./B. list-item indent (left=2160, hanging=720) —
 * they're just missing the labels. Inject `A.` and `B.` the same way
 * `addDissolutionLettering` does.
// ─── Generic colon-introduced list labeler ──────────────────────────

/**
 * Walks every paragraph in document order. When a paragraph's text ends
 * with ":" (a list-introducing colon), checks whether the immediately
 * following sibling paragraphs are at the standard letter-list indent
 * (left=2160 hanging=720) or roman-list indent (left=2880 hanging=720)
 * AND all lack labels. If so, prepends sequential A./B./C./... or
 * i./ii./iii./... to each, matching the level of the indent.
 *
 * This is the GENERIC catch-all that replaces a long tail of targeted
 * lettering functions (§5.3, §7.1, §8.4, §9.1, §10.2, §10.6, §8.2, …).
 * Stops collecting siblings as soon as it hits:
 *   - a paragraph at a different indent (e.g. body text or a heading)
 *   - a paragraph that already has a label
 *   - a Heading3 paragraph (next section)
 *
 * Idempotent: paragraphs already labeled are left alone, so this can
 * run after the targeted functions without double-labeling.
 */
type Span = {
  start: number;
  end: number;
  full: string;
  text: string;
  left: number;
  hanging: number;
  firstLine: number;
  isHeading3: boolean;
  hasLabel: boolean;
};

function autoLabelColonIntroducedLists(xml: string): string {
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  const paras: Span[] = [];
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(xml))) {
    const body = m[1];
    const text = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    const ppr = (body.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || "";
    const ind = ppr.match(/<w:ind\b([^/]*)\/>/);
    let left = 0,
      hanging = 0,
      firstLine = 0;
    if (ind) {
      const li = ind[1].match(/w:left="(\d+)"/);
      const hg = ind[1].match(/w:hanging="(\d+)"/);
      const fl = ind[1].match(/w:firstLine="([\d.]+)"/);
      if (li) left = parseInt(li[1], 10);
      if (hg) hanging = parseInt(hg[1], 10);
      if (fl) firstLine = Math.round(parseFloat(fl[1]));
    }
    const isHeading3 = /<w:pStyle w:val="Heading3"\/>/.test(ppr);
    // Has label: bare A./i./(a)/(i) or paren forms in the FIRST <w:t>.
    const firstT = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/) || [])[1] || "";
    const ft = firstT.trim();
    const hasLabel =
      /^[A-Z]\./.test(ft) ||
      /^\(([a-z])\)/.test(ft) ||
      /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\./.test(ft) ||
      /^\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)/.test(ft);
    paras.push({
      start: m.index,
      end: m.index + m[0].length,
      full: m[0],
      text,
      left,
      hanging,
      firstLine,
      isHeading3,
      hasLabel,
    });
  }

  // Identify "list-introducer" paragraphs: either ends with ":" OR is a
  // Heading3 paragraph whose text is JUST "N.M Title." with no inline
  // body (the §14.5 Successor's Interest pattern — heading alone, then
  // body paragraphs at letter-indent below). For each, look ahead for
  // unlabeled level-2/3 sibling list candidates.
  // Title-only heading: paragraph text is JUST "N.M Title." (number +
  // short title + terminal period, ≤ 60 chars total). Don't require the
  // <w:pStyle Heading3/> tag — many template sections have heading-shaped
  // text without the explicit pStyle, and we want to catch them all.
  const isTitleOnlyHeading = (p: Span) =>
    /^\d+\.\d+\s+[A-Z][\w\s'’,&-]{1,40}\.\s*$/.test(p.text);
  const isLetterIndent = (p: Span) =>
    (p.left === 2160 && p.hanging === 720) ||
    (p.left === 2160 && p.hanging === 0 && p.firstLine === 0);
  const isRomanIndent = (p: Span) =>
    (p.left === 2880 && p.hanging === 720) ||
    (p.left === 2880 && p.hanging === 0 && p.firstLine === 0);

  // Ordinal-word labels ("First,", "Second,", "Third,", "Fourth,",…) are
  // intentional alternative labeling; don't overwrite them.
  const ordinalWordLabel = /^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)\b/i;

  type Insertion = { paraIdx: number; label: string };
  const insertions: Insertion[] = [];
  for (let i = 0; i < paras.length - 1; i++) {
    const introducer = paras[i];
    const isIntro = introducer.text.endsWith(":") || isTitleOnlyHeading(introducer);
    if (!isIntro) continue;
    // Collect ALL candidate siblings first (regardless of labeling). Then
    // decide: if ANY of them is already labeled — letter, paren-letter,
    // roman, paren-roman, or ordinal word — the list is already labeled
    // somehow and we should NOT inject sequential labels (which would
    // duplicate or mix labels). Only label when the entire candidate
    // range is uniformly unlabeled.
    // First pass: scan forward up to the next Heading3 (or end of paras)
    // looking at ALL paragraphs (regardless of indent) — if ANY of them
    // is already labeled (letter/roman/paren-form/ordinal-word), the
    // section already has labels (possibly at a custom indent like
    // §3.2 Dissolution's left=1427) and we must NOT inject sequential
    // labels. This guards against double-labeling when a targeted
    // function used a non-canonical indent.
    let sawAlreadyLabeled = false;
    for (let j = i + 1; j < paras.length; j++) {
      const p = paras[j];
      if (!p.text) continue;
      if (p.isHeading3) break;
      if (p.hasLabel || ordinalWordLabel.test(p.text)) {
        sawAlreadyLabeled = true;
        break;
      }
    }
    if (sawAlreadyLabeled) continue;

    // Second pass: collect contiguous unlabeled siblings at letter/roman
    // indent immediately after the introducer.
    const candidates: number[] = [];
    let level: "letter" | "roman" | null = null;
    for (let j = i + 1; j < paras.length; j++) {
      const p = paras[j];
      if (!p.text) continue;
      if (p.isHeading3) break;
      let pLevel: "letter" | "roman" | null = null;
      if (isLetterIndent(p)) pLevel = "letter";
      else if (isRomanIndent(p)) pLevel = "roman";
      if (!pLevel) break;
      if (level === null) level = pLevel;
      else if (level !== pLevel) break;
      candidates.push(j);
    }
    if (candidates.length === 0) continue;
    for (let k = 0; k < candidates.length; k++) {
      const label =
        level === "letter"
          ? `${String.fromCharCode(65 + k)}.`
          : ["i.", "ii.", "iii.", "iv.", "v.", "vi.", "vii.", "viii.", "ix.", "x."][k];
      insertions.push({ paraIdx: candidates[k], label });
    }
  }

  if (insertions.length === 0) return xml;

  // Apply in REVERSE so earlier offsets stay valid.
  insertions.sort((a, b) => b.paraIdx - a.paraIdx);
  for (const ins of insertions) {
    const p = paras[ins.paraIdx];
    const rebuilt = p.full.replace(
      /(<w:r\b[^>]*>[\s\S]*?<\/w:rPr>)(\s*)(<w:t)/,
      `$1<w:tab/><w:t xml:space="preserve">${ins.label}</w:t><w:tab/>$3`,
    );
    if (rebuilt !== p.full) {
      xml = xml.substring(0, p.start) + rebuilt + xml.substring(p.end);
    }
  }
  return xml;
}

// ─── Collapse consecutive empty paragraphs ──────────────────────────

/**
 * After conditional-section removal (rofr=F/drag=F/tag=F etc.) the doc
 * can end up with runs of 5–8 consecutive empty paragraphs where each
 * removed section left behind its separator. Visually this produces a
 * huge blank gap (e.g. between ARTICLE XIII heading and §13.1).
 *
 * Collapse any run of >1 consecutive empty <w:p> to a single empty
 * paragraph — preserves intended single-empty separators between
 * content paragraphs but kills the cascading gaps.
 *
 * Idempotent. Only collapses paragraphs whose <w:t> contents are
 * empty/whitespace-only.
 */
function collapseConsecutiveEmptyParagraphs(xml: string): string {
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  type Span = { start: number; end: number; full: string; isEmpty: boolean };
  const paras: Span[] = [];
  let m;
  while ((m = paraRe.exec(xml))) {
    const text = (m[1].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    paras.push({
      start: m.index,
      end: m.index + m[0].length,
      full: m[0],
      isEmpty: !text,
    });
  }

  // Find runs of consecutive empties, length > 1. Mark all but the FIRST
  // for deletion.
  const toDelete: number[] = [];
  for (let i = 0; i < paras.length; ) {
    if (!paras[i].isEmpty) {
      i++;
      continue;
    }
    let j = i;
    while (j < paras.length && paras[j].isEmpty) j++;
    // [i .. j-1] is a run of empties; keep paras[i], delete i+1 .. j-1.
    for (let k = i + 1; k < j; k++) toDelete.push(k);
    i = j;
  }

  if (toDelete.length === 0) return xml;

  // Apply in REVERSE so earlier offsets stay valid.
  toDelete.sort((a, b) => b - a);
  for (const idx of toDelete) {
    const p = paras[idx];
    xml = xml.substring(0, p.start) + xml.substring(p.end);
  }
  return xml;
}

// ─── §5.3 Dissolution waterfall lettering (Corp) ────────────────────

/**
 * §5.3 Dissolution lists two unlabeled items in the proceeds-distribution
 * waterfall ("payment of Corporation debts…" and "creation in a trust
 * account of a reasonable reserve…"). Both already sit at the standard
 * letter-list indent (left=2160, hanging=720); they're just missing the
 * A./B. labels. Same shape as §7.1 Reimbursable Expenses.
 */
function addDissolutionWaterfallLettering(xml: string): string {
  const items: Array<{ anchor: string; letter: string }> = [
    { anchor: "payment of Corporation debts, including", letter: "A." },
    { anchor: "creation in a trust account of a reasonable reserve", letter: "B." },
  ];
  for (const { anchor, letter } of items) {
    const idx = xml.indexOf(anchor);
    if (idx < 0) continue;
    const pStart = xml.lastIndexOf("<w:p ", idx);
    const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
    if (pStart < 0 || pEnd <= pStart) continue;
    const para = xml.substring(pStart, pEnd);
    if (new RegExp(`<w:t[^>]*>${letter.replace(".", "\\.")}<\\/w:t>`).test(para)) continue;
    const rebuilt = para.replace(
      /(<w:r\b[^>]*>[\s\S]*?<\/w:rPr>)(\s*)(<w:t)/,
      `$1<w:tab/><w:t xml:space="preserve">${letter}</w:t><w:tab/>$3`,
    );
    xml = xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
  }
  return xml;
}

/**
 */
function addReimbursableExpensesLettering(xml: string): string {
  // No trailing period — the template splits "Reimbursable Expenses" and "."
  // into separate <w:t> runs, so the literal "Reimbursable Expenses." doesn't
  // match. Same trap as the non-compete fix.
  const sectionStart = xml.indexOf("Reimbursable Expenses");
  if (sectionStart < 0) return xml;
  // Bound at the next sub-section so we never reach into 7.2.
  const sectionEnd = xml.indexOf("Shareholders Not Liable", sectionStart);
  if (sectionEnd < 0) return xml;

  const bullets: Array<{ anchor: string; letter: string }> = [
    { anchor: "The Corporation shall reimburse the Directors and the Officers", letter: "A." },
    { anchor: "The Corporation shall pay all expenses of the Corporation, including without limitation", letter: "B." },
  ];

  for (const { anchor, letter } of bullets) {
    const idx = xml.indexOf(anchor, sectionStart);
    if (idx < 0 || idx > sectionEnd) continue;
    const pStart = xml.lastIndexOf("<w:p ", idx);
    const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
    if (pStart < 0 || pEnd <= pStart) continue;

    const para = xml.substring(pStart, pEnd);
    // Skip if already labeled (idempotent).
    if (new RegExp(`<w:t[^>]*>${letter.replace(".", "\\.")}<\\/w:t>`).test(para)) continue;

    // Prepend "<w:tab/><w:t>A.</w:t><w:tab/>" before the first <w:t> in the
    // first <w:r>, preserving its <w:rPr>.
    const rebuilt = para.replace(
      /(<w:r\b[^>]*>[\s\S]*?<\/w:rPr>)(\s*)(<w:t)/,
      `$1<w:tab/><w:t xml:space="preserve">${letter}</w:t><w:tab/>$3`,
    );

    xml = xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
  }

  // Split the inner sub-list under B. into i.–v. paragraphs. The template
  // ships 5 semicolon-separated clauses jammed into a single paragraph;
  // mirror §4.1 Authorized Shares' Voting/Dividends shape (left=2880,
  // hanging=720) so each clause is its own roman-labeled bullet.
  xml = splitReimbursableExpensesSubList(xml);

  return xml;
}

// ─── §8.4 Tax Returns lettering (Corp) ───────────────────────────────

/**
 * §8.4 ships three sub-paragraphs after the Heading3, but only the second
 * and third carry "(b)/(c)" prefixes — the first ("The Corporation's tax
 * or fiscal year shall terminate …") has no label. After the bare-form
 * canonicalizer rewrites "(b)/(c)" → "B./C.", that leaves the document
 * with B. and C. but no A. Inject A. on the unlabeled lead paragraph.
 */
function addTaxReturnsLettering(xml: string): string {
  const anchor = "The Corporation’s tax or fiscal year shall terminate";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  const para = xml.substring(pStart, pEnd);
  // Idempotent: skip if already labeled.
  if (/<w:t[^>]*>A\.<\/w:t>/.test(para)) return xml;

  const rebuilt = para.replace(
    /(<w:r\b[^>]*>[\s\S]*?<\/w:rPr>)(\s*)(<w:t)/,
    `$1<w:tab/><w:t xml:space="preserve">A.</w:t><w:tab/>$3`,
  );
  return xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
}

// ─── §9.1 Shareholder Assignment Prohibited — A.–E. list ─────────────

/**
 * §9.1 ships 5 unlabeled sub-paragraphs after the heading describing the
 * conditions for permitted assignment ("Shares are first offered…",
 * "Proposed Transferee delivers…", "The transfer complies…",
 * "Notwithstanding…", "The sale or assignment of the entire
 * Corporation…"). All level-2 sub-items under §9.1, so by the
 * 1.N → A. → i. convention they should be A.–E.
 */
function addShareholderAssignmentLettering(xml: string): string {
  const items: Array<{ anchor: string; letter: string }> = [
    { anchor: "The Shares are first offered to the current Shareholders", letter: "A." },
    { anchor: "delivers to the Corporation a written acknowledgement", letter: "B." },
    { anchor: "The transfer complies with the Securities Act", letter: "C." },
    { anchor: "Notwithstanding the generality of the foregoing, or any provision to the contrary", letter: "D." },
    { anchor: "The sale or assignment of the entire Corporation", letter: "E." },
  ];

  for (const { anchor, letter } of items) {
    const idx = xml.indexOf(anchor);
    if (idx < 0) continue;
    const pStart = xml.lastIndexOf("<w:p ", idx);
    const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
    if (pStart < 0 || pEnd <= pStart) continue;

    const para = xml.substring(pStart, pEnd);
    if (new RegExp(`<w:t[^>]*>${letter.replace(".", "\\.")}<\\/w:t>`).test(para)) continue;

    const rebuilt = para.replace(
      /(<w:r\b[^>]*>[\s\S]*?<\/w:rPr>)(\s*)(<w:t)/,
      `$1<w:tab/><w:t xml:space="preserve">${letter}</w:t><w:tab/>$3`,
    );
    xml = xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
  }
  return xml;
}

// ─── §8.2 Delivery to Shareholder — sub-list under B. ────────────────

/**
 * §8.2 ships A. (delivery on request) and B. (right to inspect/obtain),
 * where B. ends with a colon introducing two sub-items that are
 * unlabeled in the template:
 *   "Inspect and copy during normal business hours …; and"
 *   "Obtain from the Secretary, promptly after they are available, …"
 * These are level-3 sub-items under §8.2(B), so by convention they
 * should be (i)/(ii) (canonicalized to i./ii.). Prepend a label run
 * before each paragraph; normalizeListParagraphs handles the rest.
 */
function addDeliveryToShareholderRomanList(xml: string): string {
  const items: Array<{ anchor: string; label: string }> = [
    {
      anchor: "Inspect and copy during normal business hours",
      label: "(i)",
    },
    {
      anchor: "Obtain from the Secretary, promptly after they are available",
      label: "(ii)",
    },
  ];

  for (const { anchor, label } of items) {
    const idx = xml.indexOf(anchor);
    if (idx < 0) continue;
    const pStart = xml.lastIndexOf("<w:p ", idx);
    const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
    if (pStart < 0 || pEnd <= pStart) continue;
    const para = xml.substring(pStart, pEnd);

    // Idempotent: skip if a label run already exists.
    const escaped = label.replace(/[()]/g, "\\$&");
    if (new RegExp(`<w:t[^>]*>${escaped}<\\/w:t>`).test(para)) continue;

    const labelRun =
      "<w:r>" +
      '<w:rPr><w:vertAlign w:val="baseline"/><w:rtl w:val="0"/></w:rPr>' +
      `<w:t xml:space="preserve">${label}</w:t>` +
      "</w:r>";
    // Insert label run before the first existing <w:r> in the paragraph.
    const rebuilt = para.replace(
      /(<\/w:pPr>)([\s\S]*?)(<w:r\b)/,
      `$1$2${labelRun}$3`,
    );
    xml = xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
  }
  return xml;
}

// ─── §10.2 Limitation on Officers' Authority lettering (Corp) ────────

/**
 * §10.2 ships seven unlabeled list items after a Heading3 + colon-ending
 * intro ("Officers shall not have authority to:"). All seven already have
 * the A./B. list-item indent (left=2160, hanging=720). Same A.–G. shape
 * as §8.1 Records' A.–E. list. Inject A. through G. on each item.
 */
function addLimitationOnOfficersLettering(xml: string): string {
  const items: Array<{ anchor: string; letter: string }> = [
    { anchor: "perform any act in contravention", letter: "A." },
    { anchor: "perform any act that would make it impossible", letter: "B." },
    { anchor: "amend this Agreement", letter: "C." },
    { anchor: "perform any act which, pursuant to this Agreement", letter: "D." },
    { anchor: "acquire, hold, refinance, alienate", letter: "E." },
    { anchor: "borrow money on behalf of the Corporation", letter: "F." },
    { anchor: "prepay in whole or in part, refinance, increase", letter: "G." },
  ];

  for (const { anchor, letter } of items) {
    const idx = xml.indexOf(anchor);
    if (idx < 0) continue;
    const pStart = xml.lastIndexOf("<w:p ", idx);
    const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
    if (pStart < 0 || pEnd <= pStart) continue;

    const para = xml.substring(pStart, pEnd);
    if (new RegExp(`<w:t[^>]*>${letter.replace(".", "\\.")}<\\/w:t>`).test(para)) continue;

    const rebuilt = para.replace(
      /(<w:r\b[^>]*>[\s\S]*?<\/w:rPr>)(\s*)(<w:t)/,
      `$1<w:tab/><w:t xml:space="preserve">${letter}</w:t><w:tab/>$3`,
    );
    xml = xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
  }
  return xml;
}

// ─── §9.2 Involuntary Transfer lettering (Corp) ──────────────────────

/**
 * §9.2 has the same shape as §8.4: a Heading3, an unlabeled lead-in
 * paragraph, then a (b) sub-paragraph (which canonicalizes to B.). The
 * roman list (i)–(iv) sits between them as a sub-list of the lead-in.
 * Inject A. on the lead-in.
 */
function addInvoluntaryTransferLettering(xml: string): string {
  const anchor =
    "Subject to the terms and conditions of Section 13 below, persons may become an";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  const para = xml.substring(pStart, pEnd);
  if (/<w:t[^>]*>A\.<\/w:t>/.test(para)) return xml;

  const rebuilt = para.replace(
    /(<w:r\b[^>]*>[\s\S]*?<\/w:rPr>)(\s*)(<w:t)/,
    `$1<w:tab/><w:t xml:space="preserve">A.</w:t><w:tab/>$3`,
  );
  return xml.substring(0, pStart) + rebuilt + xml.substring(pEnd);
}

function splitReimbursableExpensesSubList(xml: string): string {
  const anchor = "any expenses incurred in borrowing money";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;
  const para = xml.substring(pStart, pEnd);

  // Idempotent: if already split, the anchor paragraph won't contain the full
  // semicolon-joined string anymore.
  if (!para.includes("repaying loans;")) return xml;

  const tMatch = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
  if (!tMatch) return xml;
  const fullText = tMatch[1];

  const rawParts = fullText.split(";").map((p) => p.trim()).filter(Boolean);
  if (rawParts.length !== 5) return xml; // sanity
  // Strip "and " glue from the final clause.
  rawParts[rawParts.length - 1] = rawParts[rawParts.length - 1].replace(/^and\s+/i, "");
  // Items 1-4 keep ";". Last item keeps whatever terminal punctuation it
  // shipped with (the source already ends in "."); only append "." if missing.
  const items = rawParts.map((p, i) => {
    if (i < rawParts.length - 1) return `${p};`;
    return /[.!?;]$/.test(p) ? p : `${p}.`;
  });

  const ROMAN = ["i.", "ii.", "iii.", "iv.", "v."];
  const ppr =
    "<w:pPr>" +
    '<w:keepLines w:val="1"/>' +
    '<w:widowControl w:val="1"/>' +
    '<w:spacing w:after="115" w:before="0" w:line="240" w:lineRule="auto"/>' +
    '<w:ind w:left="2880" w:hanging="720"/>' +
    '<w:jc w:val="both"/>' +
    "<w:rPr>" +
    '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
    '<w:vertAlign w:val="baseline"/>' +
    "</w:rPr>" +
    "</w:pPr>";
  const rPr =
    "<w:rPr>" +
    '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
    '<w:vertAlign w:val="baseline"/><w:rtl w:val="0"/>' +
    "</w:rPr>";

  const newParas = items
    .map(
      (body, i) =>
        `<w:p>${ppr}<w:r>${rPr}<w:tab/><w:t xml:space="preserve">${ROMAN[i]}</w:t><w:tab/><w:t xml:space="preserve">${xmlEscape(body)}</w:t></w:r></w:p>`,
    )
    .join("");

  return xml.substring(0, pStart) + newParas + xml.substring(pEnd);
}

// ─── Pagination flags ───────────────────────────────────────────────

/**
 * Both Corp and LLC templates exported from Google Docs ship with
 * `<w:keepLines w:val="0"/>` and `<w:widowControl w:val="0"/>` on every
 * body paragraph (86 occurrences in Corp, 6 in LLC). With these flags
 * disabled, Word freely splits multi-line bullets and short paragraphs
 * mid-sentence across page breaks — visible bug in §3.2 Dissolution
 * where the second bullet got torn in half.
 *
 * Flip both to "1" so each paragraph stays intact and Word's normal
 * widow/orphan control applies. Do NOT touch keepNext: forcing it on
 * globally would glue every paragraph to the next and produce huge
 * unbreakable blocks.
 */
function enablePaginationFlags(xml: string): string {
  return xml
    .replace(/<w:keepLines\s+w:val="0"\s*\/>/g, '<w:keepLines w:val="1"/>')
    .replace(/<w:widowControl\s+w:val="0"\s*\/>/g, '<w:widowControl w:val="1"/>');
}

// ─── Strip page-break-before from empty paragraphs ───────────────────

/**
 * Google Docs export injects empty paragraphs with `<w:pageBreakBefore
 * w:val="1"/>` immediately before tables (and sometimes before other
 * floating content). Result: the previous section's heading + intro
 * paragraph land alone on one page and the table starts on the next,
 * leaving a near-blank page (visible bug between §4.2 Initial Capital
 * Contributions and the capital table).
 *
 * Page-break-before on a NON-empty paragraph is intentional template
 * authoring (e.g. the cover-page title "{{entity_name}}" forcing its
 * own page); leave those alone. Strip the flag only from paragraphs
 * with no substantive text.
 */
// ─── Numbered-heading shape standardization ──────────────────────────

/**
 * Standardize EVERY numbered-section heading (§N.M) in the document to
 * one shape:
 *
 *   <w:r>(rPr no underline)<w:t xml:space="preserve">N.M </w:t></w:r>
 *   <w:r>(rPr WITH underline)<w:t>Title</w:t></w:r>
 *   <w:r>(rPr no underline)<w:t>.  body…</w:t></w:r>
 *
 * The Corp template ships THREE inconsistent shapes:
 *   A. number alone in run[0], optional <w:tab/> after — no underline on
 *      number; title underlined in run[1]. (≈25 sections; §1.1–§1.11
 *      etc.) Trailing tab is the variation we strip.
 *   B. "N.M Title" in a SINGLE underlined run — both number AND title
 *      get underlined. (≈30 sections; §2.1, §3.1, §4.1, §13.2…) Split
 *      the run so only the title carries the underline.
 *   C. number alone, no underline, no tab — already correct shape.
 *
 * Strategy: detect by the first <w:r>'s first <w:t> content.
 *   firstT === "N.M" or "N.M "          → shape A or C; strip trailing
 *                                          <w:tab/> from this run if any.
 *   firstT === "N.M Title…"             → shape B; split the run:
 *                                          number run (rPr - underline) +
 *                                          title run (rPr + underline).
 *
 * Operates only on Heading3-styled paragraphs (or any paragraph whose
 * first run text is a clean "N.M…" pattern), so we don't accidentally
 * rewrite body paragraphs that happen to start with a digit.
 */
// ─── Generic: title-only heading inline-merge with body paragraph ────

/**
 * When a heading paragraph's text is JUST "N.M Title." (≤60 chars) AND
 * the next non-empty paragraph is a body paragraph at body indent
 * (left ≤ 1500 with no list-level outdent) AND that body is NOT
 * followed by labeled list items at letter/roman indent, merge them
 * into one inline-titled paragraph (heading + ".  body…").
 *
 * Generalizes the §13.1 RoFR / §10.3 Indemnification pattern: heading
 * standing alone with body on next line is visually inconsistent with
 * the §10.4 / §10.5 / §13.2 inline-titled shape that the rest of the
 * doc uses. Instead of one targeted fix per section, this catches the
 * shape everywhere.
 *
 * Idempotent — already-inline-merged paragraphs aren't matched.
 */
function mergeTitleOnlyHeadingsWithBody(xml: string): string {
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  type MtSpan = {
    start: number;
    end: number;
    full: string;
    body: string;
    text: string;
    left: number;
    hanging: number;
    firstLine: number;
  };
  const paras: MtSpan[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = paraRe.exec(xml))) {
    const body = mm[1];
    const text = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    const ppr = (body.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || "";
    const ind = ppr.match(/<w:ind\b([^/]*)\/>/);
    let left = 0,
      hanging = 0,
      firstLine = 0;
    if (ind) {
      const li = ind[1].match(/w:left="(\d+)"/);
      const hg = ind[1].match(/w:hanging="(\d+)"/);
      const fl = ind[1].match(/w:firstLine="([\d.]+)"/);
      if (li) left = parseInt(li[1], 10);
      if (hg) hanging = parseInt(hg[1], 10);
      if (fl) firstLine = Math.round(parseFloat(fl[1]));
    }
    paras.push({
      start: mm.index,
      end: mm.index + mm[0].length,
      full: mm[0],
      body,
      text,
      left,
      hanging,
      firstLine,
    });
  }

  const TITLE_ONLY = /^\d+\.\d+\s+[A-Z][\w\s'’,&-]{1,40}\.\s*$/;
  const merges: Array<{ headingIdx: number; bodyIdx: number; emptyIdxs: number[] }> = [];
  for (let i = 0; i < paras.length - 1; i++) {
    const h = paras[i];
    if (!TITLE_ONLY.test(h.text)) continue;
    const empties: number[] = [];
    let j = i + 1;
    while (j < paras.length && !paras[j].text) {
      empties.push(j);
      j++;
    }
    if (j >= paras.length) continue;
    const b = paras[j];
    // Body must be at BODY indent (NOT letter-list 2160 or roman 2880).
    const isBodyIndent =
      (b.left <= 1500 && b.hanging === 0 && b.firstLine === 0) ||
      (b.left <= 1440 && b.hanging === 1440);
    if (!isBodyIndent) continue;
    if (TITLE_ONLY.test(b.text) || /^\d+\.\d+\b/.test(b.text)) continue;
    // Don't merge if body is followed by labeled list (it's an intro).
    let hasLabeledFollow = false;
    for (let k = j + 1; k < Math.min(j + 6, paras.length); k++) {
      const p = paras[k];
      if (!p.text) continue;
      if (/^[A-Z]\.|\([a-z]\)/.test(p.text.trim())) hasLabeledFollow = true;
      break;
    }
    if (hasLabeledFollow) continue;
    merges.push({ headingIdx: i, bodyIdx: j, emptyIdxs: empties });
  }

  if (merges.length === 0) return xml;

  // Apply in REVERSE so earlier offsets stay valid.
  merges.sort((a, b) => b.headingIdx - a.headingIdx);
  for (const mrg of merges) {
    const heading = paras[mrg.headingIdx];
    const body = paras[mrg.bodyIdx];

    // Build a body run; strip underline from the heading's last rPr so
    // the appended body text isn't styled as a title.
    const allRPr = heading.body.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g) || [];
    const headingLastRPr = allRPr[allRPr.length - 1] || "";
    const plainRPr = headingLastRPr.replace(/<w:u w:val="single"\/>/g, "");
    const bodyRun =
      `<w:r>${plainRPr}` +
      `<w:t xml:space="preserve">  ${xmlEscape(body.text)}</w:t>` +
      `</w:r>`;

    // Insert body run before the closing </w:p> of the heading.
    const newHeading = heading.full.replace(/<\/w:p>\s*$/, `${bodyRun}</w:p>`);

    // Remove body paragraph + intervening empties (in REVERSE order so
    // offsets stay valid within this single merge).
    const removeIdxs = [mrg.bodyIdx, ...mrg.emptyIdxs].sort((a, b) => b - a);
    let mutated = xml;
    for (const idx of removeIdxs) {
      const p = paras[idx];
      mutated = mutated.substring(0, p.start) + mutated.substring(p.end);
    }
    mutated = mutated.substring(0, heading.start) + newHeading + mutated.substring(heading.end);
    xml = mutated;
  }
  return xml;
}

// ─── Generic: rebuild fractured numbered-heading run sequences ───────

/**
 * Some templates ship a single numbered heading whose runs are split
 * across many tiny pieces — leading whitespace run, number-only run,
 * <w:tab/> run, underlined-title run, period run, <w:tab/> run, body
 * run (e.g. §15.11 WAIVER OF JURY TRIAL in the 6-owner Corp template).
 *
 * Standardize-shape can't fix this because it inspects only the FIRST
 * run, which is empty here. Detect the shape (by reconstructing the
 * logical heading text, treating <w:tab/> as space) and rebuild the
 * runs in canonical Shape B: "N.M " un-underlined + "TITLE" underlined
 * + ".  body…" un-underlined.
 *
 * Generic — works on any §X.Y heading whose run shape doesn't already
 * follow Shape B. Idempotent.
 */
function rebuildFracturedNumberedHeadings(xml: string): string {
  return xml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (full) => {
    const pPrEnd = full.indexOf("</w:pPr>");
    if (pPrEnd < 0) return full;
    const afterPPr = full.substring(pPrEnd + 8);
    const closeP = afterPPr.lastIndexOf("</w:p>");
    if (closeP < 0) return full;
    const runsBlock = afterPPr.substring(0, closeP);
    const trailer = afterPPr.substring(closeP);

    // Logical heading text with <w:tab/> as space.
    const text = runsBlock
      .replace(/<w:tab\/>/g, " ")
      .replace(/<w:br\/>/g, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Heading-shape signal: starts "N.M Capitalized…", and contains a
    // period followed by uppercase body text (so it's not just a
    // bare-title heading like §13.1 — those are handled elsewhere).
    const m = text.match(/^(\d+\.\d+)\s+([A-Z][\w\s'’,&-]{1,80}?)\.\s+([A-Z].*)$/);
    if (!m) return full;
    const [, num, title, body] = m;

    // Already-canonical Shape B sentinel: first run is "<w:t>N.M </w:t>"
    // (with trailing space) and second run is underlined title. Skip if
    // we already match.
    const firstRunMatch = runsBlock.match(/<w:r\b[\s\S]*?<\/w:r>/);
    if (firstRunMatch) {
      const firstT = (firstRunMatch[0].match(/<w:t[^>]*>([^<]*)<\/w:t>/) || [])[1] || "";
      if (firstT === `${num} ` || firstT === `${num} `) {
        // Likely already standardized; bail to avoid re-write churn.
        return full;
      }
    }

    // Pull the first non-empty <w:rPr> as the formatting basis. Strip
    // bold/underline so we can re-apply per-run.
    const allRPrs = runsBlock.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g) || [];
    const baseRPr =
      (allRPrs.find((r) => !/^<w:rPr>\s*<\/w:rPr>$/.test(r)) || "")
        .replace(/<w:b w:val="1"\/>/g, "")
        .replace(/<w:bCs w:val="1"\/>/g, "")
        .replace(/<w:u w:val="single"\/>/g, "");
    const noUnderlineRPr = baseRPr;
    const underlineRPr = baseRPr.includes("</w:rPr>")
      ? baseRPr.replace("</w:rPr>", '<w:b w:val="1"/><w:bCs w:val="1"/><w:u w:val="single"/></w:rPr>')
      : '<w:rPr><w:b w:val="1"/><w:bCs w:val="1"/><w:u w:val="single"/></w:rPr>';

    const newRuns =
      `<w:r>${noUnderlineRPr}<w:t xml:space="preserve">${num} </w:t></w:r>` +
      `<w:r>${underlineRPr}<w:t>${xmlEscape(title)}</w:t></w:r>` +
      `<w:r>${noUnderlineRPr}<w:t xml:space="preserve">.  ${xmlEscape(body)}</w:t></w:r>`;

    return full.substring(0, pPrEnd + 8) + newRuns + trailer;
  });
}

// ─── Close ARTICLE XIII numbering gap when stripped ─────────────────

/**
 * When all 3 transfer covenants (rofr, drag, tag) are off, ARTICLE XIII
 * "TRANSFERS AND ASSIGNMENTS" gets stripped entirely, leaving the
 * document jumping from ARTICLE XII to ARTICLE XIV. Renumber subsequent
 * articles to close the gap:
 *   ARTICLE XIV → ARTICLE XIII
 *   ARTICLE XV  → ARTICLE XIV
 *   §14.x → §13.x  (in headings and any cross-references)
 *   §15.x → §14.x
 *
 * Self-detecting: only fires if ARTICLE XIII heading is absent.
 */
function closeArticleXIIIGap(xml: string): string {
  if (xml.includes("ARTICLE XIII:")) return xml;
  if (!xml.includes("ARTICLE XIV:") || !xml.includes("ARTICLE XV:")) return xml;

  // Operate on text content of <w:t> runs to avoid mangling XML structure.
  return xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (full, text) => {
    let t = text;
    // Article-level (do XV first so we don't double-shift)
    t = t.replace(/ARTICLE XV\b/g, " ARTXIV ");
    t = t.replace(/ARTICLE XIV\b/g, "ARTICLE XIII");
    t = t.replace(/ ARTXIV /g, "ARTICLE XIV");
    // Section-level §14.N / §15.N (in headings AND any cross-refs).
    // Do 15→14 first via sentinel so we don't shift twice.
    t = t.replace(/(?<!\d)15\.(\d+)/g, "15.$1");
    t = t.replace(/(?<!\d)14\.(\d+)/g, (_, n) => `13.${n}`);
    t = t.replace(/15\.(\d+)/g, (_, n) => `14.${n}`);
    return full.replace(text, t);
  });
}

// ─── Add breathing room between signature blocks ────────────────────

/**
 * Templates ship the signature block with a single empty paragraph
 * between each shareholder's "Name: X" line and the next "By: ___"
 * line, leaving signatures cramped — readers asked for "more space
 * for signatures when there's room" since the sig block sits at the
 * top of an otherwise empty page.
 *
 * Insert TWO additional empty paragraphs (3-blank-line gap total)
 * between each consecutive shareholder block, between the last
 * shareholder and "CORPORATION", and between "CORPORATION" header
 * blocks.
 */
function expandSignatureBlockSpacing(xml: string): string {
  // Anchor on the curly-quoted "SHAREHOLDERS" sig header (distinct
  // from "SHAREHOLDERS' AGREEMENT" on the cover page) and walk back to
  // the START of that paragraph, so block-paragraph regex operates on
  // a clean <w:p>...</w:p> sequence (not mid-paragraph).
  const headerIdx = xml.indexOf("“SHAREHOLDERS”");
  if (headerIdx < 0) return xml;
  const sigStart = xml.lastIndexOf("<w:p ", headerIdx);
  if (sigStart < 0) return xml;
  const sigEnd = xml.indexOf("</w:body>", sigStart);
  if (sigEnd < 0) return xml;
  const head = xml.substring(0, sigStart);
  const tail = xml.substring(sigEnd);
  let block = xml.substring(sigStart, sigEnd);

  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  type Span = { start: number; end: number; full: string; text: string; isSig: boolean };
  const paras: Span[] = [];
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(block))) {
    const body = m[1];
    const text = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    const ppr = (body.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || "";
    const isSigIndent = /<w:ind\b[^/]*w:left="5040"/.test(ppr);
    paras.push({
      start: m.index,
      end: m.index + m[0].length,
      full: m[0],
      text,
      isSig: isSigIndent,
    });
  }

  // Build the empty sig-indented paragraph as a clone of the existing
  // empty separators in the sig block.
  const sigEmpty =
    '<w:p><w:pPr><w:ind w:left="5040"/><w:jc w:val="both"/>' +
    '<w:rPr><w:vertAlign w:val="baseline"/></w:rPr></w:pPr></w:p>';

  // Insert 2 additional empty paragraphs after each "Name: X" line
  // (or "Title: X" line for the final corp block) when followed by
  // another sig-block paragraph. Walk forward and collect insert
  // points.
  type Insert = { atIdx: number; text: string };
  const inserts: Insert[] = [];
  for (let i = 0; i < paras.length - 1; i++) {
    const p = paras[i];
    if (!p.isSig) continue;
    const isNameLine = /^Name:\s/.test(p.text);
    if (!isNameLine) continue;
    // Find the next non-empty sig paragraph.
    let target = i + 1;
    while (target < paras.length && !paras[target].text) target++;
    if (target >= paras.length) continue;
    const nextText = paras[target].text;
    // Only expand spacing when the next signer block starts: another
    // "By:" line OR a section header like "CORPORATION". Skip
    // "Title:" (immediately follows the corp signer's "Name:" — they
    // belong together as one block) and skip anything else.
    const isNextNewBlock =
      /^By:/.test(nextText) ||
      /CORPORATION|SHAREHOLDERS/.test(nextText);
    if (!isNextNewBlock) continue;
    inserts.push({ atIdx: paras[target].start, text: sigEmpty + sigEmpty });
  }

  if (inserts.length === 0) return xml;
  // Apply in REVERSE so earlier offsets stay valid.
  inserts.sort((a, b) => b.atIdx - a.atIdx);
  for (const ins of inserts) {
    block = block.substring(0, ins.atIdx) + ins.text + block.substring(ins.atIdx);
  }

  return head + block + tail;
}

// ─── Repoint broken §14.1(b)/(d) cross-references to live targets ───

/**
 * Template's ARTICLE XIV ships with cross-references to §14.1(b) and
 * §14.1(d), but §14.1 has no sub-items (a)/(b)/(c)/(d) — the
 * referenced content is in §14.3 (definition of "incapacitated") and
 * §14.5 (option-to-purchase clauses) respectively. The broken
 * references confuse readers ("but there's no 14.1(d)" — user note).
 *
 * Repoint:
 *   "Section 14.1(b)" → "Section 14.3"
 *   "Section 14.1(d)" / "14.1(d)" / "14.1 (d)" → "Section 14.5"
 */
function fixArticle14CrossReferences(xml: string): string {
  // Process the textual content of <w:t> runs in-place to avoid
  // touching other XML structure.
  return xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (full, text) => {
    let t = text;
    t = t.replace(/Section\s+14\.1\(b\)/g, "Section 14.3");
    t = t.replace(/Section\s+14\.1\s*\(d\)/g, "Section 14.5");
    t = t.replace(/(?<!Section\s)14\.1\s*\(d\)/g, "Section 14.5");
    return full.replace(text, t);
  });
}

// ─── Generic: strip keepLines from letter/roman list items ──────────

/**
 * Templates ship list-item paragraphs (A./B./C./i./ii.) with
 * <w:keepLines w:val="1"/> set, which prevents the paragraph from
 * breaking internally across pages. For LONG items like §10.8 A.
 * Confidential Information (a 10-line definition), this means the
 * entire 10-line item must fit at the bottom of the current page —
 * if only 5 lines fit, the whole item moves to the next page leaving
 * a half-blank page above it.
 *
 * Strip keepLines from letter (left=2160 hanging=720) and roman
 * (left=2880 hanging=720) list items. Word's natural widowControl
 * still prevents single-line orphans/widows.
 */
function removeKeepLinesFromListItems(xml: string): string {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (full) => {
    const ppr = (full.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || "";
    const ind = ppr.match(/<w:ind\b([^/]*)\/>/);
    if (!ind) return full;
    const li = ind[1].match(/w:left="(\d+)"/);
    const hg = ind[1].match(/w:hanging="(\d+)"/);
    if (!li || !hg) return full;
    const left = parseInt(li[1], 10);
    const hanging = parseInt(hg[1], 10);
    const isListItem =
      (left === 2160 && hanging === 720) ||
      (left === 2880 && hanging === 720);
    if (!isListItem) return full;
    return full.replace(/<w:keepLines\s+w:val="1"\s*\/>/g, "");
  });
}

// ─── Generic: strip bold from §X.Y inline-titled heading runs ───────

/**
 * Templates ship one bold-underlined §X.Y title (§10.9 Non-Disparagement)
 * while every other §X.Y title is underlined-only. Visually inconsistent.
 *
 * Strip <w:b>/<w:bCs> from any UNDERLINED run in a §X.Y heading
 * paragraph (Heading3 pStyle, ind left=1440 hanging=1440). Body runs
 * (un-underlined) are unaffected — bold inside body text is intentional.
 */
function stripBoldFromInlineTitleRuns(xml: string): string {
  return xml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (full) => {
    const ppr = (full.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || "";
    const isHeading3 =
      /<w:pStyle\s+w:val="Heading3"\/>/.test(ppr) &&
      /<w:ind[^/]*w:left="1440"[^/]*\/>/.test(ppr);
    if (!isHeading3) return full;
    // Only fire on §X.Y heading-shape paragraphs.
    const allText = (full.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    if (!/^\d+\.\d+\s+[A-Z]/.test(allText)) return full;

    // Inside any <w:r> whose <w:rPr> contains <w:u w:val="single"/>,
    // strip <w:b w:val="1"/> and <w:bCs w:val="1"/>.
    return full.replace(/<w:r\b[\s\S]*?<\/w:r>/g, (run) => {
      if (!/<w:u\s+w:val="single"\s*\/>/.test(run)) return run;
      return run
        .replace(/<w:b\s+w:val="1"\s*\/>/g, "")
        .replace(/<w:bCs\s+w:val="1"\s*\/>/g, "")
        .replace(/<w:b\s*\/>/g, "")
        .replace(/<w:bCs\s*\/>/g, "");
    });
  });
}

// ─── Generic: collapse empties between consecutive list items ────────

/**
 * Templates ship inconsistent letter-list spacing — some sections (e.g.
 * §9.1) have letter items packed tight, others (§8.1, §10.8) have an
 * empty paragraph between every letter, and §10.2 is mixed. The
 * inconsistency is visible as random blank-line gaps between A./B./C.
 * items in some sections but not others.
 *
 * Canonicalize: between two consecutive paragraphs at the SAME letter
 * indent (left=2160 hanging=720) OR same roman indent (left=2880
 * hanging=720), if there is exactly one TRULY empty paragraph between
 * them, drop it. Both surrounding paragraphs must start with a label
 * (A./B. or i./ii.) so we don't merge unrelated letter-styled body
 * paragraphs into a list.
 *
 * Idempotent — once collapsed, the next run finds no empty between
 * letters and is a no-op.
 */
function collapseEmptiesBetweenListItems(xml: string): string {
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  type Span = {
    start: number;
    end: number;
    text: string;
    left: number;
    hanging: number;
  };
  const paras: Span[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = paraRe.exec(xml))) {
    const body = mm[1];
    const text = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    const ppr = (body.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || "";
    const ind = ppr.match(/<w:ind\b([^/]*)\/>/);
    let left = 0;
    let hanging = 0;
    if (ind) {
      const li = ind[1].match(/w:left="(\d+)"/);
      const hg = ind[1].match(/w:hanging="(\d+)"/);
      if (li) left = parseInt(li[1], 10);
      if (hg) hanging = parseInt(hg[1], 10);
    }
    paras.push({
      start: mm.index,
      end: mm.index + mm[0].length,
      text,
      left,
      hanging,
    });
  }

  // Templates ship with and without the post-period space ("A.x" and
  // "A. x" both occur). Indent already filters to letter-list level;
  // require just letter + period at start of text.
  const LETTER_LABEL = /^[A-Z]\.(?:\s|\S)/;
  const ROMAN_LABEL = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\.(?:\s|\S)/i;
  const isLetterItem = (p: Span) =>
    p.left === 2160 && p.hanging === 720 && LETTER_LABEL.test(p.text);
  const isRomanItem = (p: Span) =>
    p.left === 2880 && p.hanging === 720 && ROMAN_LABEL.test(p.text);

  // Collect indices of empty paragraphs sandwiched between two
  // same-level list items. Walk in REVERSE so removal-by-slice keeps
  // earlier offsets valid.
  const removeIdxs: number[] = [];
  for (let i = 1; i < paras.length - 1; i++) {
    const p = paras[i];
    if (p.text) continue;
    const prev = paras[i - 1];
    const next = paras[i + 1];
    const sameLetter = isLetterItem(prev) && isLetterItem(next);
    const sameRoman = isRomanItem(prev) && isRomanItem(next);
    if (sameLetter || sameRoman) removeIdxs.push(i);
  }

  if (removeIdxs.length === 0) return xml;
  removeIdxs.sort((a, b) => b - a);
  for (const idx of removeIdxs) {
    const p = paras[idx];
    xml = xml.substring(0, p.start) + xml.substring(p.end);
  }
  return xml;
}

// ─── Generic: normalize all numbered-section heading pPr ─────────────

/**
 * Force every numbered §X.Y heading paragraph in the document to use
 * the canonical Heading3 pPr. Catches per-section indent/tab quirks
 * (e.g. §15.11's custom layout vs the rest of §15.x) without targeted
 * fixes per section.
 */
function normalizeAllSectionHeadingPPr(xml: string): string {
  const CANON_PPR =
    "<w:pPr>" +
    "<w:keepNext/>" +
    '<w:pStyle w:val="Heading3"/>' +
    "<w:tabs>" +
    '<w:tab w:val="left" w:leader="none" w:pos="720"/>' +
    "</w:tabs>" +
    '<w:ind w:left="1440" w:hanging="1440"/>' +
    '<w:jc w:val="both"/>' +
    "<w:rPr>" +
    '<w:vertAlign w:val="baseline"/>' +
    "</w:rPr>" +
    "</w:pPr>";
  return xml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (full) => {
    // Skip paragraphs inside tables (capital contributions table cells
    // hold "20.00%" / "$50,000.00" etc. — same digit pattern as N.M
    // headings). The paragraph itself is inside a <w:tc>; we can't
    // detect that from the paragraph alone, so use a heading-shape
    // signal instead: paragraph text must start with "N.M " followed
    // by a CAPITAL LETTER (heading title), not just any digits.
    //
    // Some templates split "N.M" + tab + "TITLE" across separate runs
    // with a <w:tab/> between them; <w:t>-only concatenation reads as
    // "N.MTITLE" with no whitespace. Build a logical heading text by
    // stripping ALL tags (so <w:t> contents survive) and treating
    // <w:tab/> and <w:br/> as a single space — same as Word renders
    // them.
    const pPrEnd = full.indexOf("</w:pPr>");
    const afterPPr = pPrEnd >= 0 ? full.substring(pPrEnd + 8) : full;
    const allTexts = afterPPr
      .replace(/<w:tab\/>/g, " ")
      .replace(/<w:br\/>/g, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!/^\d+\.\d+\s+[A-Z]/.test(allTexts)) return full;
    if (/<w:pPr>/.test(full)) {
      return full.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, CANON_PPR);
    }
    return full.replace(/(<w:p\b[^>]*>)/, `$1${CANON_PPR}`);
  });
}

function standardizeNumberedHeadingShape(xml: string): string {
  return xml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (full) => {
    // Locate first <w:r> after the pPr.
    const pPrEnd = full.indexOf("</w:pPr>");
    const afterPPr = pPrEnd >= 0 ? full.substring(pPrEnd + 8) : full;
    const firstRunMatch = afterPPr.match(/<w:r\b[\s\S]*?<\/w:r>/);
    if (!firstRunMatch) return full;
    const firstRun = firstRunMatch[0];

    // Pull the first <w:t> content.
    const tMatch = firstRun.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
    if (!tMatch) return full;
    const firstT = tMatch[1];

    // Match "N.M" optionally followed by a space then a title.
    // Whole text must be N.M-ish, not body text that happens to mention numbers.
    const m = firstT.match(/^(\d+\.\d+)(?:\s+(.+?))?\s*$/);
    if (!m) return full;
    const num = m[1];
    const inlineTitle = m[2]; // undefined if Shape A/C

    // Extract the run's <w:rPr> (formatting). Build with-underline + no-underline variants.
    const rPrMatch = firstRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    const rPrNoUnderline = rPr.replace(/<w:u w:val="single"\/>/g, "");
    let rPrWithUnderline = rPrNoUnderline;
    if (rPrWithUnderline.includes("</w:rPr>")) {
      rPrWithUnderline = rPrWithUnderline.replace(
        "</w:rPr>",
        '<w:u w:val="single"/></w:rPr>',
      );
    } else {
      rPrWithUnderline = '<w:rPr><w:u w:val="single"/></w:rPr>';
    }

    let rebuilt = full;
    if (inlineTitle !== undefined) {
      // Shape B: split the run into "N.M " (no underline) + "Title"
      // (underline). If the inline content contains a period (because the
      // entire body sits in the same run, e.g. the non-compete inserter's
      // §10.8 paragraph), split at the FIRST ". " so only the actual
      // title text gets underlined and the body becomes a third run.
      let titleOnly = inlineTitle;
      let bodyAfter: string | null = null;
      const dotMatch = inlineTitle.match(/^([^.]+?)(\.[\s\S]*)$/);
      if (dotMatch) {
        titleOnly = dotMatch[1];
        bodyAfter = dotMatch[2];
      }
      const bodyRun = bodyAfter
        ? `<w:r>${rPrNoUnderline}<w:t xml:space="preserve">${bodyAfter}</w:t></w:r>`
        : "";
      const newRuns =
        `<w:r>${rPrNoUnderline}<w:t xml:space="preserve">${num} </w:t></w:r>` +
        `<w:r>${rPrWithUnderline}<w:t>${titleOnly}</w:t></w:r>` +
        bodyRun;
      rebuilt = rebuilt.replace(firstRun, newRuns);
    } else {
      // Shape A or C: number alone in this run. Force the run to
      // <w:r>{rPrNoUnderline}<w:t xml:space="preserve">N.M </w:t></w:r> —
      // guaranteed single trailing space, no tabs, no underline on number.
      const newFirstRun =
        `<w:r>${rPrNoUnderline}<w:t xml:space="preserve">${num} </w:t></w:r>`;
      rebuilt = rebuilt.replace(firstRun, newFirstRun);
    }

    // Standardize the period→body transition. Three patterns ship:
    //   (a) "<w:t>.</w:t><w:tab/><w:t>Body…</w:t>" — period+tab+body in
    //       separate runs (Article 2/3, many others). Replace with
    //       "<w:t xml:space=\"preserve\">.  </w:t>".
    //   (b) Period glued to the END of the underlined title run
    //       (<w:t>Salary and Bonus.</w:t>), with the next run being
    //       a body run that starts with <w:tab/>. Strip "." from title,
    //       drop the leading <w:tab/> from body, prepend ".  " to body.
    //   (c) Period in its own <w:t>, no tab between (rare).
    rebuilt = rebuilt.replace(
      /<w:t(?:\s+[^>]*)?>\.<\/w:t><w:tab\/>/,
      `<w:t xml:space="preserve">.  </w:t>`,
    );

    // Pattern (b): underlined title run's <w:t> ends with "." (e.g. §6.1
    // "Salary and Bonus.", §10.8 "Covenant Against Competition.", §15.7
    // "Notices."). Strip the period from the underlined run and prepend
    // ".  " to the next (body) run, replacing any leading whitespace+tab
    // with the canonical "  " gap.
    rebuilt = rebuilt.replace(
      /(<w:r\b[^>]*><w:rPr>[\s\S]*?<w:u w:val="single"\/>[\s\S]*?<\/w:rPr><w:t[^>]*>[^<]*?)\.(<\/w:t><\/w:r>)\s*(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t[^>]*>\s*<\/w:t><w:tab\/><w:t([^>]*)>/,
      `$1$2$3<w:t xml:space="preserve">.  </w:t><w:t$4>`,
    );
    // Variant: title period-strip + body run that doesn't have the
    // "<w:t>spaces</w:t><w:tab/>" pattern (just a single body <w:t>).
    rebuilt = rebuilt.replace(
      /(<w:r\b[^>]*><w:rPr>[\s\S]*?<w:u w:val="single"\/>[\s\S]*?<\/w:rPr><w:t[^>]*>[^<]*?)\.(<\/w:t><\/w:r>)\s*(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t([^>]*)>(?!\.)/,
      `$1$2$3<w:t xml:space="preserve">.  </w:t><w:t$4>`,
    );

    return rebuilt;
  });
}

// ─── §4.3 New Shareholders heading tab normalization ─────────────────

/**
 * §4.3 is the only numbered heading in the Corp template that ships with
 * a leading <w:tab/> before the "4.3 " number AND a trailing <w:tab/>
 * after the title's period. Result: "4.3" indents from the left margin,
 * "New Shareholders" sits with extra space, and the body text starts at
 * a deeper position than §4.4–§4.6 (which have no tabs at all). Strip
 * §4.3's tabs so it aligns with its neighbors.
 */
function normalizeNewShareholdersHeading(xml: string): string {
  const anchor = "New Shareholders (beyond the number";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  let para = xml.substring(pStart, pEnd);
  // 1. Drop the leading <w:tab/> in the run that holds "N.M ".
  para = para.replace(
    /(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:tab\/>(<w:t[^>]*>\d+\.\d+\s*<\/w:t>)<w:tab\/>/,
    "$1$2",
  );
  // 2. The body run starts with "<w:t>.</w:t><w:tab/><w:t>New Shareholders (beyond …".
  //    Replace the dangling tab with two spaces so body flows like §4.4
  //    ("<w:t>.  Any theft …</w:t>").
  para = para.replace(
    /(<w:t[^>]*>\.<\/w:t>)<w:tab\/>(<w:t[^>]*>)New Shareholders \(beyond/,
    "$1$2  New Shareholders (beyond",
  );

  return xml.substring(0, pStart) + para + xml.substring(pEnd);
}

// ─── Signature-block layout normalization ────────────────────────────

/**
 * Normalize the signature block layout so every line ("SHAREHOLDERS",
 * "By:", "Name:", "CORPORATION", "Corp Name a State corporation",
 * "Title:") starts at the same left column.
 *
 * Template inconsistencies the user spotted:
 *   - First shareholder block ("Roberto") uses 7 leading <w:tab/> runs
 *     (default 0.5" stops → ~3.5"/5040 twips).
 *   - Second/third shareholder blocks use <w:ind w:left="4254"
 *     w:firstLine="708.999…"/> (~3.45"/4963 twips). Slightly off the
 *     first block.
 *   - The "Corp Name a State corporation" line uses
 *     <w:ind w:left="5040" w:hanging="2880"/> which OUTDENTS the first
 *     line by 2880 twips (1.4" off — most visible misalignment).
 *   - "Name: <name>Title: <title>" appears as ONE paragraph with leading
 *     tabs and a long mid-tab block instead of two separate lines.
 *
 * Fix: walk every paragraph from the sig-block header (curly-quoted
 * "SHAREHOLDERS") to the end of the body, replace any <w:ind .../> with
 * <w:ind w:left="5040"/> (no firstLine, no hanging — flush at 3.5"
 * uniformly) AND strip leading <w:tab/> runs.
 */
function normalizeSignatureBlockLayout(xml: string): string {
  // Anchor on the curly-quoted "SHAREHOLDERS" (sig block) — distinct from
  // "SHAREHOLDERS' AGREEMENT" on the cover page.
  const start = xml.indexOf("“SHAREHOLDERS”");
  if (start < 0) return xml;
  const sigStart = xml.lastIndexOf("<w:p ", start);
  if (sigStart < 0) return xml;
  const bodyEnd = xml.lastIndexOf("</w:body>");
  if (bodyEnd < 0) return xml;

  const before = xml.substring(0, sigStart);
  let middle = xml.substring(sigStart, bodyEnd);
  const after = xml.substring(bodyEnd);

  // Pre-step: split the combined "Name: <name>Title: <title>" paragraph
  // into TWO paragraphs (Name on one line, Title on the next). The
  // template glues them together with intermediate tabs.
  middle = splitCombinedNameTitleParagraph(middle);

  // Per-paragraph: replace <w:ind> with canonical, strip leading tabs.
  const CANON_IND = '<w:ind w:left="5040"/>';
  middle = middle.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (full) => {
    let updated = full;

    // Replace any existing <w:ind ... /> with the canonical.
    if (/<w:ind\b[^/]*\/>/.test(updated)) {
      updated = updated.replace(/<w:ind\b[^/]*\/>/, CANON_IND);
    } else if (/<w:pPr>/.test(updated)) {
      updated = updated.replace("<w:pPr>", `<w:pPr>${CANON_IND}`);
    } else {
      updated = updated.replace(/(<w:p\b[^>]*>)/, `$1<w:pPr>${CANON_IND}</w:pPr>`);
    }

    // Strip a contiguous run of leading <w:tab/> elements at the start
    // of the FIRST <w:r> (after the optional <w:rPr>). These are how the
    // template positioned text horizontally; with the canonical <w:ind>
    // doing the job, they're redundant and would push text further right.
    updated = updated.replace(
      /(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)((?:\s*<w:tab\/>)+)/,
      "$1",
    );

    // Force jc=both on every sig-block paragraph. addExtraCorpShareholders
    // (4+ owners) inserts paragraphs with <w:jc w:val="center"/> which
    // visually pushes them to the right of the page even though their
    // <w:ind> matches the rest of the block. Replace any existing <w:jc>
    // with both to keep alignment uniform.
    if (/<w:jc\s+w:val="(?!both")[^"]*"\s*\/>/.test(updated)) {
      updated = updated.replace(
        /<w:jc\s+w:val="(?!both")[^"]*"\s*\/>/g,
        '<w:jc w:val="both"/>',
      );
    }

    return updated;
  });

  // Remove leftover "X.XX% Owner" ownership-tag paragraphs that
  // addExtraCorpShareholders inserts for 4+ owner blocks. These appear
  // between Name: and the next "By:" and serve no purpose.
  middle = middle.replace(
    /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<w:t[^>]*>\d+(?:\.\d+)?%\s+Owner<\/w:t>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g,
    "",
  );

  return before + middle + after;
}

/**
 * Helper: split "Name: <name>Title: <title>" combined paragraph into two
 * separate paragraphs ("Name: …" and "Title: …"). Triggered by the
 * literal "Name:" + many tabs + "Title:" structure the template ships
 * for the corporation signature line.
 */
function splitCombinedNameTitleParagraph(xml: string): string {
  // Iterate paragraph-by-paragraph (no cross-paragraph regex spans).
  return xml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (full, body) => {
    // Must contain BOTH "Name:" and "Title:" as separate <w:t> contents
    // within this single paragraph.
    if (!/<w:t[^>]*>\s*Name:[^<]*<\/w:t>/.test(body)) return full;
    if (!/<w:t[^>]*>\s*Title:[^<]*<\/w:t>/.test(body)) return full;

    const rPrMatch = body.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";

    // Extract the name text — the <w:t> contents AFTER "Name:" and BEFORE
    // the <w:t> containing "Title:".
    const split = body.split(/<w:t[^>]*>\s*Title:/);
    if (split.length < 2) return full;
    const beforeTitle = split[0];
    // Last <w:t> in beforeTitle that isn't "Name:" carries the name itself.
    const tBefore = [...beforeTitle.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(
      (m) => m[1],
    );
    const nameIdx = tBefore.findIndex((t) => /^\s*Name:/.test(t));
    const nameText =
      nameIdx >= 0 && nameIdx + 1 < tBefore.length
        ? tBefore[nameIdx + 1].trim()
        : "";

    // Extract the title text — "Title: <text>" appears in split[1] up to
    // the next "</w:t>".
    const titleClose = split[1].indexOf("</w:t>");
    const titleText = titleClose >= 0 ? split[1].substring(0, titleClose).trim() : "";

    const ppr =
      '<w:pPr><w:ind w:left="5040"/><w:rPr><w:vertAlign w:val="baseline"/></w:rPr></w:pPr>';
    const nameRun =
      `<w:r>${rPr}` +
      `<w:t xml:space="preserve">Name:  ${xmlEscape(nameText)}</w:t>` +
      `</w:r>`;
    const titleRun =
      `<w:r>${rPr}` +
      `<w:t xml:space="preserve">Title: ${xmlEscape(titleText)}</w:t>` +
      `</w:r>`;
    return `<w:p>${ppr}${nameRun}</w:p><w:p>${ppr}${titleRun}</w:p>`;
  });
}

// ─── Keep titles glued to their bodies (no orphan headings) ──────────

/**
 * Word will break a page immediately after a paragraph that lacks
 * keepNext, even if the next thing on the page is a table or a body
 * paragraph that "obviously" belongs to the heading. To prevent any
 * heading or pre-table paragraph from orphaning at the bottom of a
 * page (a recurring complaint — "no titles with a page break right
 * under, at least one line before the break"), force keepNext=1 on
 * the paragraph immediately preceding every <w:tbl>. The chain
 * heading → intro → empty → table only stays glued if every link
 * carries keepNext.
 */
function forceKeepNextBeforeTables(xml: string): string {
  // Collect all <w:tbl> offsets first (so subsequent splices don't shift
  // the regex iterator), then process in REVERSE so earlier splices don't
  // invalidate later offsets.
  const offsets: number[] = [];
  const tblRe = /<w:tbl\b/g;
  let m: RegExpExecArray | null;
  while ((m = tblRe.exec(xml))) offsets.push(m.index);

  for (let i = offsets.length - 1; i >= 0; i--) {
    const tblOffset = offsets[i];
    const pClose = xml.lastIndexOf("</w:p>", tblOffset);
    if (pClose < 0) continue;
    const pStart = paragraphStartBefore(xml, pClose);
    if (pStart < 0) continue;
    const para = xml.substring(pStart, pClose + "</w:p>".length);
    if (/<w:keepNext(?:\s+w:val="1")?\s*\/>/.test(para)) continue;

    let fixed = para;
    if (/<w:keepNext\s+w:val="0"\s*\/>/.test(fixed)) {
      fixed = fixed.replace(/<w:keepNext\s+w:val="0"\s*\/>/, "<w:keepNext/>");
    } else if (/<w:pPr>/.test(fixed)) {
      fixed = fixed.replace(/<w:pPr>/, "<w:pPr><w:keepNext/>");
    } else {
      fixed = fixed.replace(/(<w:p\b[^>]*>)/, "$1<w:pPr><w:keepNext/></w:pPr>");
    }
    if (fixed !== para) {
      xml = xml.substring(0, pStart) + fixed + xml.substring(pClose + "</w:p>".length);
    }
  }
  return xml;
}

function stripEmptyParagraphPageBreaks(xml: string): string {
  return xml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (full, body) => {
    if (!/<w:pageBreakBefore w:val="1"\s*\/>/.test(body)) return full;
    const text = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t: string) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    if (text) return full; // intentional break (e.g. cover-page title)
    return full.replace(/<w:pageBreakBefore w:val="1"\s*\/>/, "");
  });
}

// ─── XML Repair ─────────────────────────────────────────────────────

/**
 * Fix unclosed tags left by post-processing insertions.
 */
function repairXml(xml: string): string {
  // Remove empty trailing reopened paragraphs: <w:p><w:r><w:t xml:space="preserve">
  // followed by </w:t></w:r></w:p> or by the next paragraph/section
  // These are left by closeParagraphAndInsert when there's no remaining text.

  // Pattern: <w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p> (completely empty)
  xml = xml.replace(/<w:p><w:r><w:t xml:space="preserve"><\/w:t><\/w:r><\/w:p>/g, "");

  // Pattern: trailing <w:p><w:r><w:t xml:space="preserve"> before </w:sectPr> or </w:body>
  // These are unclosed — remove them entirely
  xml = xml.replace(/<w:p><w:r><w:t xml:space="preserve">(\s*)<\/w:sectPr>/g, "</w:sectPr>");
  xml = xml.replace(/<w:p><w:r><w:t xml:space="preserve">(\s*)<\/w:body>/g, "</w:body>");

  // More aggressive: find any <w:p><w:r><w:t ...> that's immediately followed by
  // another <w:p> (meaning the reopened paragraph has no content before the next paragraph starts)
  xml = xml.replace(/<w:p><w:r><w:t xml:space="preserve"><\/w:t><\/w:r><\/w:p>/g, "");

  // Handle case where the empty reopen is followed by a closing </w:p>
  // which creates: ...content</w:p><w:p><w:r><w:t xml:space="preserve"></w:p>
  // Remove the orphaned <w:p><w:r><w:t xml:space="preserve">
  xml = xml.replace(/<w:p><w:r><w:t xml:space="preserve">(<\/w:p>)/g, "$1");

  // Final safety: count and fix any remaining mismatches
  // Process innermost first: w:t, then w:r, then w:p
  for (const tag of ["w:t", "w:r", "w:p"]) {
    const openCount = (xml.match(new RegExp(`<${tag}[ >]`, "g")) || []).length;
    const closeCount = (xml.match(new RegExp(`</${tag}>`, "g")) || []).length;
    if (openCount > closeCount) {
      // Find the last unclosed tag and remove it (not add closing — that's fragile)
      for (let i = 0; i < openCount - closeCount; i++) {
        // Remove the last bare <w:p><w:r><w:t...> sequence before </w:body>
        const bodyIdx = xml.lastIndexOf("</w:body>");
        const lastOpen = xml.lastIndexOf(`<${tag}`, bodyIdx);
        if (lastOpen >= 0) {
          // Check if this tag has a matching close after it
          const afterTag = xml.indexOf(">", lastOpen) + 1;
          const nextClose = xml.indexOf(`</${tag}>`, afterTag);
          const nextOpen = xml.indexOf(`<${tag}`, afterTag);
          if (nextClose < 0 || (nextOpen >= 0 && nextOpen < nextClose)) {
            // This tag is unclosed — remove it and its content up to the next tag
            const endOfTag = xml.indexOf(">", lastOpen) + 1;
            xml = xml.substring(0, lastOpen) + xml.substring(endOfTag);
          }
        }
      }
    }
  }

  return xml;
}

// ─── Prefix Article II sub-items with 2.1 / 2.2 / 2.3 / 2.4 ───────────

/**
 * The Corp template has four sub-items under ARTICLE II: INCORPORATION —
 * "Articles", "Purpose", "Name", "Place of Business" — each bolded but
 * without a sub-number (no 2.1, 2.2, ...). Client review flagged this:
 * every other article numbers its subsections, Article II doesn't.
 *
 * Each caption is its own <w:t> inside a paragraph. Target them by
 * matching the exact caption text *between* ARTICLE II and ARTICLE III,
 * and insert "2.1 ", "2.2 ", "2.3 ", "2.4 " prefixes into the first <w:t>
 * of the caption run.
 *
 * Guardrails:
 *   - Only touch the first four captions between ARTICLE II and ARTICLE III
 *   - Do nothing if the caption already starts with "2." (idempotent)
 *   - Leave other occurrences of "Name" / "Purpose" elsewhere untouched
 */
function prefixArticle2Subsections(xml: string): string {
  const startIdx = xml.indexOf("ARTICLE II: INCORPORATION");
  if (startIdx < 0) return xml;
  const endIdx = xml.indexOf("ARTICLE III", startIdx + 20);
  if (endIdx < 0) return xml;

  const before = xml.substring(0, startIdx);
  let block = xml.substring(startIdx, endIdx);
  const after = xml.substring(endIdx);

  const captions: Array<[string, string]> = [
    ["Articles", "2.1 "],
    ["Purpose", "2.2 "],
    ["Name", "2.3 "],
    ["Place of Business", "2.4 "],
  ];

  for (const [caption, prefix] of captions) {
    // Match a <w:t ...>caption</w:t> (exact text) — only the first occurrence
    // inside this block. Skip if already prefixed with "2.".
    const tagRe = new RegExp(
      `(<w:t[^>]*>)(${caption.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")})(</w:t>)`,
    );
    const m = tagRe.exec(block);
    if (!m) continue;
    // Idempotency: check the content before the match isn't already "2.x "
    const lookbehind = block.substring(Math.max(0, m.index - 60), m.index);
    if (/2\.\d\s*$/.test(lookbehind)) continue;
    block =
      block.substring(0, m.index) +
      m[1] +
      prefix +
      m[2] +
      m[3] +
      block.substring(m.index + m[0].length);
  }

  return before + block + after;
}

// ─── Sequentially renumber every Article's Heading3 sub-items + remap cross-refs ───
/**
 * Walks every `<w:p>` in document order. On each "ARTICLE N:" heading,
 * resets the sub-counter. On each Heading3 paragraph inside an article,
 * assigns a fresh sequential `N.M` number — OVERWRITING any existing
 * `N.M` prefix the template carried — so the final doc reads 1.1, 1.2,
 * 1.3 … with no gaps, regardless of:
 *
 *   1. **Template author gaps.** The attorney's corp template skips 1.2
 *      (Article I goes 1.1 → 1.3 → 1.4 …). This closes that.
 *   2. **Conditional content changes.** If the questionnaire removes a
 *      section (ROFR=No kills Article XII's ROFR subsections, Drag/Tag-Along=No
 *      kills their respective sections), this renumbers whatever survives
 *      so no holes remain.
 *   3. **Conditional content additions.** If Non-Compete=Yes inserts a new
 *      10.10 paragraph, or Super Majority is injected at 1.7, they get
 *      their proper sequential slot automatically.
 *
 * As it renumbers, it builds an `oldNum → newNum` map (keyed on the
 * paragraph's prior `N.M` prefix, if any). A second pass then rewrites
 * every body-text cross-reference — "Section 9.2", "Paragraph 10.5",
 * "Article 4.3", lowercase "paragraph 13.2" — using that map. Unknown
 * cross-references (e.g. template's bogus "Section 10.6" that points to
 * a never-existed section) are left untouched so they don't silently
 * degrade to something misleading.
 *
 * Must run AFTER all conditional paragraph injection/removal so numbering
 * reflects the final surviving paragraph set.
 *
 * Idempotent on subsequent runs.
 */
const ROMAN_TO_INT: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8,
  IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16,
};

function renumberAndRemapSubsections(xml: string): string {
  const remap = new Map<string, string>();
  let currentArticle: number | null = null;
  let nextSub = 1;

  // ── Pass 1: sequentially renumber every Heading3, build remap map ──
  const renumbered = xml.replace(
    /<w:p([ >][\s\S]*?)<\/w:p>/g,
    (fullMatch) => {
      // Concatenated plain text of this paragraph across all <w:t> runs.
      const texts = (fullMatch.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
        .map((t) => t.replace(/<[^>]+>/g, ""));
      const fullText = texts.join("").trim();
      if (!fullText) return fullMatch;

      // "ARTICLE N: …" heading — reset article + sub counter.
      const artMatch = fullText.match(/^ARTICLE\s+([IVXLCDM]+)(?::|\b)/i);
      if (artMatch) {
        const num = ROMAN_TO_INT[artMatch[1].toUpperCase()];
        if (num) {
          currentArticle = num;
          nextSub = 1;
        }
        return fullMatch;
      }

      // A paragraph is a "numbered section" if it matches ANY of:
      //   (a) has <w:pStyle w:val="Heading3"/> — the standard sub-section
      //       style used by most of the template.
      //   (b) has a first <w:t>N.M</w:t><w:tab/> structural pattern — the
      //       attorney's template marks "1.2 Affiliate" this way with no
      //       pStyle at all; if we skipped these, renumbering Heading3-
      //       styled paragraphs would collide with their hard-coded
      //       template number.
      //   (c) inline "underlined title + period + body" header — the
      //       template author wrote several section headers as a single
      //       paragraph: first run is an underlined short title, next run
      //       starts with ". " and carries the body. No pStyle, no leading
      //       N.M<tab>. Examples: Article IV's "Forfeiture of Shares" /
      //       "Additional Capital Contributions" / "Dilution"; Article XI's
      //       "Quarterly Meetings" / "Emergency Meetings" / "Emergency
      //       Board"; Article XIV's "Death of a Shareholder" / "Incapacity"
      //       / "Divorce" / "Successor's Interest". Missing these orphans
      //       cross-refs like "Section 4.4 above".
      //
      // Article II's "Articles/Purpose/Name/Place of Business" captions
      // hit path (a) after prefixArticle2Subsections prepends their "2.N "
      // prefixes (the captions themselves aren't Heading3 but we detect
      // the N.M prefix — wait, they're not N.M<tab>, they're "2.1 Articles"
      // in a single <w:t>). Those are NOT picked up here; they stay at
      // 2.1-2.4 from prefixArticle2Subsections which is already sequential.
      const isHeading3 = /<w:pStyle w:val="Heading3"\/>/.test(fullMatch);
      const hasNumTabPattern =
        /<w:t[^>]*>\d+\.\d+<\/w:t>\s*<w:tab\/>/.test(fullMatch);

      // Branch (d): Heading4 paragraph whose first <w:t> starts with a
      // hardcoded "N.M" prefix. Only match "15.11 WAIVER OF JURY TRIAL"
      // right now — Article XV's jury-trial waiver, typeset all-caps with
      // pStyle="Heading4" (not Heading3) and a leading " 15.11" glued
      // directly to "WAIVER" with no space. The other Heading4 paragraph
      // in the template ("i.Voting.") starts with "i" so is unaffected.
      let isHeading4WithInlineNum = false;
      if (/<w:pStyle w:val="Heading4"\/>/.test(fullMatch)) {
        const firstT = fullMatch.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
        if (firstT && /^\s*\d+\.\d+/.test(firstT[1])) {
          isHeading4WithInlineNum = true;
        }
      }

      // Detect branch (c): first body run is underlined short title, next
      // <w:t> starts with "." (period glue between title and body).
      let hasUnderlinedTitlePattern = false;
      if (!isHeading3 && !hasNumTabPattern) {
        const firstRunMatch = fullMatch.match(/<w:r\b[\s\S]*?<\/w:r>/);
        const allTexts = (fullMatch.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
          .map((t) => t.replace(/<[^>]+>/g, ""));
        if (firstRunMatch && allTexts.length >= 2) {
          const firstRun = firstRunMatch[0];
          const firstRunUnderlined = /<w:u w:val="single"\/>/.test(firstRun);
          const firstRunText = (firstRun.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
            .map((t) => t.replace(/<[^>]+>/g, ""))
            .join("")
            .trim();
          const secondText = allTexts[1] || "";
          if (
            firstRunUnderlined &&
            firstRunText.length > 2 &&
            firstRunText.length <= 80 &&
            !/^\d/.test(firstRunText) &&
            allTexts[0].trim() === firstRunText &&
            /^\s*\./.test(secondText)
          ) {
            hasUnderlinedTitlePattern = true;
          }
        }
      }

      if (
        !isHeading3 &&
        !hasNumTabPattern &&
        !hasUnderlinedTitlePattern &&
        !isHeading4WithInlineNum
      ) {
        return fullMatch;
      }
      if (currentArticle === null) return fullMatch;

      const newNum = `${currentArticle}.${nextSub}`;
      nextSub += 1;

      // Detect the existing N.M number from the joined text. This catches
      // both single-run ("1.3") and split-run ("1." + "3") variants. We
      // only use this to build the remap — the actual rewrite operates on
      // the first <w:t> below.
      const existingNumMatch = fullText.match(/^(\d+)\.(\d+)\b/);
      if (existingNumMatch) {
        const oldNum = `${existingNumMatch[1]}.${existingNumMatch[2]}`;
        if (oldNum !== newNum) remap.set(oldNum, newNum);
      }

      // Branch (c): insert a new non-styled run BEFORE the first <w:r>
      // carrying "newNum " so the underlined title (and everything else)
      // is preserved as-is, and the number renders in normal weight. A
      // plain space (not <w:tab/>) avoids depending on tab-stop geometry
      // that wasn't set for these paragraphs.
      if (hasUnderlinedTitlePattern) {
        const newRun =
          `<w:r><w:t xml:space="preserve">${newNum} </w:t></w:r>`;
        // <w:r\b — word boundary after "r" — will NOT match <w:rPr
        // because "rP" has no word boundary between the two word chars.
        return fullMatch.replace(/<w:r\b/, `${newRun}<w:r`);
      }

      // Rewrite the first <w:t>'s body to carry the new number.
      //   Shape A (number alone in first run, caption in subsequent run):
      //     <w:t>1.3</w:t><w:tab/><w:t>Assignee</w:t>   → replace "1.3" with newNum
      //   Shape B (number + caption in same run):
      //     <w:t>2.1 Articles</w:t>                     → swap the leading "2.1"
      //   Shape C (unnumbered caption):
      //     <w:t>Commencement</w:t>                     → prepend "newNum "
      //   Shape D (number glued to caption, branch-d Heading4):
      //     <w:t> 15.11WAIVER OF JURY TRIAL</w:t>       → swap "15.11" preserving "WAIVER…"
      return fullMatch.replace(
        /(<w:t[^>]*>)([^<]*)(<\/w:t>)/,
        (_m, open, body, close) => {
          // Shapes A + B + D unified: body starts with "N.M" (optional
          // leading ws, then digits.digits, then anything — whitespace,
          // text, or end-of-string). Preserve leading whitespace and
          // whatever follows the old number verbatim (so glued-caption
          // paragraphs like "15.11WAIVER" stay glued, not double-spaced).
          const numPrefix = body.match(/^(\s*)(\d+\.\d+)([\s\S]*)$/);
          if (numPrefix) {
            const [, leadWS, , rest] = numPrefix;
            return `${open}${leadWS}${newNum}${rest}${close}`;
          }
          // Shape C: no existing number on this run — prepend "newNum ".
          // Split-number guard: if the number was split into "1." / "3"
          // across runs we'd land here and produce "newNum 1." — this
          // shouldn't happen in the attorney's template (Word emits
          // complete numbers in one run) but we log it rather than
          // silently corrupt.
          if (/^(\d+\.)$/.test(body) || /^\d$/.test(body)) {
            // eslint-disable-next-line no-console
            console.warn(
              `[renumberAndRemapSubsections] first <w:t> body "${body}" ` +
                `looks like a split number run — newNum=${newNum} may conflict`,
            );
          }
          return `${open}${newNum} ${body}${close}`;
        },
      );
    },
  );

  // Nothing to remap? Skip the second pass.
  if (remap.size === 0) return renumbered;

  // ── Pass 2: rewrite body-text cross-references via the remap ──
  // Matches "Section 9.2", "Sections 9.2", "Paragraph 10.5", "paragraph 13.2",
  // "Article 4.3", "Articles 4.3" — case-insensitive on the keyword, preserves
  // the original keyword casing (including singular/plural) in the output.
  // Operates within each <w:t> body independently; cross-refs that were
  // split across runs won't match (extremely rare in practice).
  return renumbered.replace(
    /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
    (full, open, body, close) => {
      const newBody = body.replace(
        /\b(Sections?|Paragraphs?|Articles?)(\s+)(\d+\.\d+)\b/gi,
        (m: string, word: string, sep: string, num: string) => {
          const remapped = remap.get(num);
          if (!remapped || remapped === num) return m;
          return `${word}${sep}${remapped}`;
        },
      );
      return newBody === body ? full : `${open}${newBody}${close}`;
    },
  );
}

// ─── Signature block "Owner" label — replace with title or remove ─────

/**
 * The sig block for each owner currently renders as:
 *   By: _____________
 *   Name: <full name>
 *   Owner[ of the Company]          ← the label we're rewriting
 *
 * Client video TODO #16 flags this label as noise. Replacement rule:
 *   - If the owner filled in a title via Step 6 (Specific Responsibilities),
 *     render that title in place of "Owner".
 *   - Otherwise, remove the paragraph entirely (no dangling blank line).
 *
 * We find each "Name: <owner.full_name>" paragraph and then rewrite or
 * remove the next paragraph, which (per the templates and our extra-sig
 * builders) is always the "Owner" / "Owner of the Company" line.
 */
function rewriteSignatureOwnerLabel(
  xml: string,
  owners: Owner[],
): string {
  for (const owner of owners) {
    if (!owner || !owner.full_name) continue;
    const nameAnchor = `Name:`;
    // Find the paragraph that contains both the nameAnchor and the
    // owner's full name, then the very next <w:p> after it.
    const pattern = new RegExp(
      `(<w:p\\b[^>]*>[\\s\\S]*?Name:[\\s\\S]*?` +
        owner.full_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        `[\\s\\S]*?</w:p>)([\\s\\S]*?)` +
        `(<w:p\\b[^>]*>[\\s\\S]*?</w:p>)`,
    );
    const m = xml.match(pattern);
    if (!m) continue;
    const nextPara = m[3];
    const nextText = (nextPara.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    // Only touch if the next paragraph's text is the "Owner..." label.
    if (!/^Owner(?:\s+of\s+the\s+Company)?$/i.test(nextText)) continue;

    const title = (owner.title || "").trim();
    if (title) {
      // Swap "Owner..." text for "Title: <title>". The "Title:" prefix
      // mirrors the "Name:" label above it so the T in Title lines up
      // with the N in Name (both sit after the same 7 leading tabs).
      // Two spaces after the colon match the template's "Name:  " format.
      const rewritten = nextPara.replace(
        /<w:t[^>]*>[^<]*<\/w:t>/,
        `<w:t xml:space="preserve">Title:  ${title}</w:t>`,
      );
      xml = xml.replace(pattern, `$1$2${rewritten}`);
    } else {
      // Remove the "Owner" paragraph entirely.
      xml = xml.replace(pattern, `$1$2`);
    }
  }
  return xml;
}

// ─── [SIGNATURE PAGE BELOW] heading — keep-together + conditional ─────

/**
 * The Corp + LLC templates contain a centered bold paragraph reading
 * "[SIGNATURE PAGE BELOW]" followed by a separate paragraph with a
 * <w:br w:type="page"/>, then the "IN WITNESS WHEREOF" signature block.
 *
 * Per-template intent: the heading is a visual cue at the BOTTOM of
 * the last content page telling the reader signatures are on the
 * following page. Removing it unconditionally is wrong: for a long
 * agreement the signatures always land on a separate page, so the cue
 * is accurate and should stay.
 *
 * Two things we DO need to fix:
 *   1. Client video TODO #17 ("heading dangles on a mostly-blank
 *      page by itself"): this happens when the last content paragraph
 *      wraps such that the heading gets pushed alone onto a new page.
 *      Fix: apply <w:keepNext/> to the paragraph immediately BEFORE
 *      the heading so Word pulls the heading up with that paragraph,
 *      preventing the dangle.
 *   2. When the signature block actually FITS on the last content
 *      page alongside the heading (very short doc), the heading
 *      reads redundantly ("below" when sigs are right there). In
 *      that unlikely case we can still remove the heading, but only
 *      if the document is demonstrably short — not applied here
 *      because our Shareholders' Agreement is always multi-page.
 */
function removeSignaturePageBelowHeading(xml: string): string {
  // Locate the "[SIGNATURE PAGE BELOW]" paragraph.
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  let headingStart = -1;
  let headingEnd = -1;
  while ((match = pRe.exec(xml)) !== null) {
    const para = match[0];
    const txt = (para.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    if (txt === "[SIGNATURE PAGE BELOW]") {
      headingStart = match.index;
      headingEnd = match.index + para.length;
      break;
    }
  }
  if (headingStart < 0) return xml;

  // Add <w:keepNext/> to the paragraph IMMEDIATELY PRECEDING the heading
  // so Word pulls the heading up with the last content paragraph instead
  // of orphaning it onto a blank new page.
  const beforeHeading = xml.substring(0, headingStart);
  const precedingPClose = beforeHeading.lastIndexOf("</w:p>");
  if (precedingPClose >= 0) {
    const precedingPStart = paragraphStartBefore(beforeHeading, precedingPClose);
    if (precedingPStart >= 0) {
      const precedingP = beforeHeading.substring(
        precedingPStart,
        precedingPClose + "</w:p>".length,
      );
      if (!/<w:keepNext\s*\/>/.test(precedingP)) {
        let fixedP: string;
        if (/<w:pPr>/.test(precedingP)) {
          fixedP = precedingP.replace(/<w:pPr>/, "<w:pPr><w:keepNext/>");
        } else {
          fixedP = precedingP.replace(
            /(<w:p\b[^>]*>)/,
            "$1<w:pPr><w:keepNext/></w:pPr>",
          );
        }
        return (
          xml.substring(0, precedingPStart) +
          fixedP +
          xml.substring(precedingPClose + "</w:p>".length)
        );
      }
    }
  }
  return xml;
}

// ─── § 9.2 Involuntary-Transfer romanette list — fix indent ────────────

/**
 * § 9.2 ("Involuntary Transfer") in the Corp template has its enumerated
 * items (i)(ii)(iii)(iv) inside a paragraph whose <w:pPr> declares:
 *   <w:ind w:left="1440" w:firstLine="0"/>
 *   <w:tabs>
 *     <w:tab w:val="left" w:pos="8640"/>  ← 6 inches from left margin
 *     <w:tab w:val="left" w:pos="9360"/>  ← past page width
 *     ... (continues to pos="17280")
 *   </w:tabs>
 *
 * Each romanette marker is followed by a tab character. Word jumps to the
 * first tab stop at 8640 twips, pushing the list text to the far right of
 * the page and leaving a huge empty gap in the middle — client video
 * TODOs #11 and #12. (The gap is so wide the list *looks* like a broken
 * two-column layout.)
 *
 * Fix: replace the §9.2 paragraph's <w:tabs> with a single reasonable tab
 * stop (1800 twips = 1.25"), and normalize its indent to a standard
 * hanging-indent list format. Targeted at paragraphs whose text contains
 * "(i)" or "court order" AND a left indent of 1440 — the signature of
 * this specific offending section.
 */
function fixSection92ListIndent(xml: string): string {
  // Any <w:p> that contains a romanette marker (`(i)`..`(vi)`) in its text
  // AND has the broken 1440-twip left indent with wide tabs (>= 8000) gets
  // its tabs collapsed to a single 1800-twip stop and its indent tightened
  // to a standard hanging list (720 left / 360 hanging).
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para) => {
    const paraText = (para.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("");
    if (!/\((?:i|ii|iii|iv|v|vi)\)/.test(paraText)) return para;

    const hasBadIndent = /<w:ind\s+w:left="1440"/.test(para);
    // Tabs can be written either with w:leader attribute or without, and
    // with attributes in any order. Just check for any tab with pos >= 8000.
    const hasBadTabs = /<w:tab\b[^/]*w:pos="(?:[89]\d{3}|1\d{4})"/.test(para);
    if (!hasBadIndent || !hasBadTabs) return para;

    let fixed = para;
    fixed = fixed.replace(
      /<w:tabs>[\s\S]*?<\/w:tabs>/,
      '<w:tabs><w:tab w:val="left" w:pos="1800"/></w:tabs>',
    );
    fixed = fixed.replace(
      /<w:ind\s+w:left="1440"\s+w:firstLine="0"\s*\/>/,
      '<w:ind w:left="720" w:hanging="360"/>',
    );
    return fixed;
  });
}

// ─── Capital Contributions Table — fix width overflow ─────────────────

/**
 * The Corp template's § 4.2 Initial Capital Contributions table ships with
 *   <w:tblW w:w="10570" w:type="dxa"/>
 *   <w:tblGrid>2826 + 2522 + 2606 + 2616 = 10570</w:tblGrid>
 * which is ~7.34 inches. Page content width at US-Letter w/ 1" margins is
 * only ~9360 twips (6.5"). Result: the table runs past the right margin
 * and gets cut off when printed — client video TODO #10.
 *
 * Shrink the table to 9000 twips (6.25") proportionally:
 *   Name 30%  Shares 20%  Capital 25%  Percentage 25%  = 2700+1800+2250+2250
 */
function fixCapitalTableWidth(xml: string): string {
  const anchor = "Number of Shares";
  const anchorIdx = xml.indexOf(anchor);
  if (anchorIdx < 0) return xml;

  const tblStart = xml.lastIndexOf("<w:tbl>", anchorIdx);
  const tblEndExclusive = xml.indexOf("</w:tbl>", anchorIdx) + "</w:tbl>".length;
  if (tblStart < 0 || tblEndExclusive <= tblStart) return xml;

  let tbl = xml.substring(tblStart, tblEndExclusive);

  // 1. Shrink total table width
  tbl = tbl.replace(
    /<w:tblW\s+w:w="[\d.]+"\s+w:type="dxa"\s*\/>/,
    '<w:tblW w:w="9000" w:type="dxa"/>',
  );

  // 2. Ensure fixed layout (required so column widths are honored)
  if (!/<w:tblLayout\s+w:type="fixed"\s*\/>/.test(tbl)) {
    tbl = tbl.replace(
      /(<w:tblPr>[\s\S]*?)(<\/w:tblPr>)/,
      '$1<w:tblLayout w:type="fixed"/>$2',
    );
  }

  // 3. Replace tblGrid with proportional 4-col grid summing to 9000.
  //    Keep the <w:tblGridChange> sibling (tracks history) intact.
  //    Col 4 ("Percentage Ownership Interest" = 29 chars bold) needs
  //    ~3000 twips to fit the header on one line; col 3 ("Capital
  //    Contribution" = 19 chars) fits comfortably in 2300.
  const newGridCols =
    '<w:gridCol w:w="2200"/>' + // Name
    '<w:gridCol w:w="1700"/>' + // Shares (header "Number of / Shares Owned" wraps to 2 lines)
    '<w:gridCol w:w="2300"/>' + // Capital
    '<w:gridCol w:w="2800"/>';  // Percentage (header fits "Percentage Ownership / Interest" on 2 lines)
  tbl = tbl.replace(
    /(<w:tblGrid>)(?:<w:gridCol[^/]*\/>)+(<w:tblGridChange[\s\S]*?<\/w:tblGridChange>)?/,
    `$1${newGridCols}$2`,
  );

  // 4. Rewrite every row's cell widths (<w:tcW>) to match the new grid.
  //    Corp template has some cells with tcW and some without; normalize
  //    by ensuring each row's cells get the right tcW in order.
  tbl = tbl.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    const widths = [2200, 1700, 2300, 2800];
    let colIdx = 0;
    return row.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cell) => {
      const w = widths[colIdx++] ?? 2250;
      // If the cell has a tcPr with tcW, replace it. Otherwise insert one.
      if (/<w:tcW\b[^/]*\/>/.test(cell)) {
        return cell.replace(
          /<w:tcW\b[^/]*\/>/,
          `<w:tcW w:w="${w}" w:type="dxa"/>`,
        );
      }
      if (/<w:tcPr>/.test(cell)) {
        return cell.replace(
          /(<w:tcPr>)/,
          `$1<w:tcW w:w="${w}" w:type="dxa"/>`,
        );
      }
      // No tcPr at all — inject one as the first child of <w:tc>
      return cell.replace(
        /(<w:tc\b[^>]*>)/,
        `$1<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>`,
      );
    });
  });

  // 4b. Normalize EVERY paragraph in EVERY cell to force visible centering.
  //     Some cell paragraphs ship with non-zero <w:ind> inherited from
  //     pStyle, which left-leans centered text by ~0.1-0.2" — visible
  //     asymmetry on names like "Roberto Mendez". Force jc=center + zero
  //     ind on every cell paragraph.
  tbl = tbl.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
    const canonPPr =
      "<w:pPr>" +
      "<w:keepNext/>" +
      '<w:ind w:left="0" w:right="0" w:firstLine="0"/>' +
      '<w:jc w:val="center"/>' +
      '<w:rPr><w:vertAlign w:val="baseline"/></w:rPr>' +
      "</w:pPr>";
    if (/<w:pPr>/.test(para)) {
      return para.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, canonPPr);
    }
    return para.replace(/(<w:p\b[^>]*>)/, `$1${canonPPr}`);
  });

  // 5. Keep the whole table on one page (never split across a page break).
  //    - <w:cantSplit/> on every row prevents a single row from being torn
  //      in half by a page break.
  //    - <w:keepNext/> on every paragraph inside every row EXCEPT the last
  //      glues each row to the next one, so Word treats the entire table
  //      (header + data rows) as an atomic block that moves together.
  const rows = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  rows.forEach((row, i) => {
    const isLast = i === rows.length - 1;
    let fixed = row;
    // cantSplit
    if (!/<w:cantSplit\s*\/>/.test(fixed)) {
      if (/<w:trPr>/.test(fixed)) {
        fixed = fixed.replace(/<w:trPr>/, "<w:trPr><w:cantSplit/>");
      } else {
        fixed = fixed.replace(
          /(<w:tr\b[^>]*>)/,
          "$1<w:trPr><w:cantSplit/></w:trPr>",
        );
      }
    }
    // keepNext on every paragraph of every non-last row
    if (!isLast) {
      fixed = fixed.replace(
        /<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g,
        (pMatch, attrs, inner) => {
          if (/<w:keepNext\s*\/>/.test(inner)) return pMatch;
          if (/<w:pPr>/.test(inner)) {
            return `<w:p${attrs}>${inner.replace(
              /<w:pPr>/,
              "<w:pPr><w:keepNext/>",
            )}</w:p>`;
          }
          return `<w:p${attrs}><w:pPr><w:keepNext/></w:pPr>${inner}</w:p>`;
        },
      );
    }
    if (fixed !== row) tbl = tbl.replace(row, fixed);
  });

  // 6. Force the §4.2 HEADING paragraph (NOT the empty intermediate
  //    paragraph between heading and table) to start on a fresh page via
  //    <w:pageBreakBefore/> + <w:keepNext/>. Putting pageBreakBefore on
  //    the empty paragraph orphans the §4.2 heading + intro on the
  //    previous page; putting it on the heading itself keeps the entire
  //    §4.2 block (heading + intro + table) flowing together onto the
  //    fresh page.
  //
  //    cantSplit + keepNext per row keeps individual rows whole and chained,
  //    but Word's keep-with-next chain breaks under content pressure when
  //    the chain doesn't fit on the current page — observed in 6-owner
  //    Corp where the table got torn between row 1 (Roberto) and row 2.
  //    pageBreakBefore on the heading guarantees the §4.2 block always
  //    has a full fresh page to render onto.
  let before = xml.substring(0, tblStart);
  // Find the §4.2 heading paragraph (anchor "Initial Capital Contributions").
  const headingAnchor = "Initial Capital Contributions";
  const headingIdx = before.lastIndexOf(headingAnchor);
  if (headingIdx >= 0) {
    const precedingPStart = paragraphStartBefore(before, headingIdx);
    const precedingPClose = before.indexOf("</w:p>", headingIdx);
    if (precedingPStart >= 0 && precedingPClose >= 0) {
      const precedingP = before.substring(precedingPStart, precedingPClose + "</w:p>".length);
      let fixedP = precedingP;
      // Add <w:pageBreakBefore/> if not already there
      if (!/<w:pageBreakBefore\b[^/]*\/>/.test(fixedP)) {
        if (/<w:pPr>/.test(fixedP)) {
          fixedP = fixedP.replace(
            /<w:pPr>/,
            '<w:pPr><w:pageBreakBefore w:val="1"/>',
          );
        } else {
          fixedP = fixedP.replace(
            /(<w:p\b[^>]*>)/,
            '$1<w:pPr><w:pageBreakBefore w:val="1"/></w:pPr>',
          );
        }
      } else {
        // pageBreakBefore exists — flip val=0 to val=1 if disabled
        fixedP = fixedP.replace(
          /<w:pageBreakBefore\s+w:val="0"\s*\/>/,
          '<w:pageBreakBefore w:val="1"/>',
        );
      }
      // Add <w:keepNext/> alongside
      if (!/<w:keepNext\s*\/>/.test(fixedP) && !/<w:keepNext\s+w:val="1"\s*\/>/.test(fixedP)) {
        fixedP = fixedP.replace(
          /<w:keepNext\s+w:val="0"\s*\/>/,
          '<w:keepNext w:val="1"/>',
        );
        if (!/<w:keepNext\b/.test(fixedP)) {
          fixedP = fixedP.replace(/<w:pPr>/, '<w:pPr><w:keepNext/>');
        }
      }
      if (fixedP !== precedingP) {
        before = before.substring(0, precedingPStart) + fixedP + before.substring(precedingPClose + "</w:p>".length);
      }
    }
  }

  return before + tbl + xml.substring(tblEndExclusive);
}

// ─── Force Times New Roman (fix template Arial default) ───────────────

/**
 * The LLC and Corp templates have Arial set as the default font in
 * word/styles.xml and word/theme/theme1.xml. Even though every run in
 * document.xml has an explicit Times New Roman rFonts override, some
 * renderers (notably WPS Office, Word Online in certain states, and any
 * content we insert via post-processing that lacks explicit rFonts) fall
 * back to the styles.xml / theme defaults and display Arial.
 *
 * Patch those fallback declarations so the default font IS Times New
 * Roman. Georgia (used for a few heading styles) is preserved. This
 * mutates the PizZip instance in place.
 */
function forceTimesNewRomanFont(zip: PizZip): void {
  // Fonts we explicitly want to keep as-is. Symbol is needed for bullets;
  // Courier New is used (rarely) for monospace blocks and shouldn't be
  // coerced to TNR. Everything else gets normalized.
  const preserve = new Set(["Times New Roman", "Symbol", "Courier New", "Wingdings"]);

  const targets = ["word/styles.xml", "word/theme/theme1.xml", "word/document.xml"];
  for (const part of targets) {
    const file = zip.file(part);
    if (!file) continue;
    let content = file.asText();

    // Normalize w:rFonts attributes (styles.xml + document.xml).
    for (const axis of ["ascii", "hAnsi", "cs", "eastAsia"] as const) {
      content = content.replace(
        new RegExp(`w:${axis}="([^"]+)"`, "g"),
        (_match, face) =>
          preserve.has(face) ? _match : `w:${axis}="Times New Roman"`,
      );
    }

    // theme1.xml uses <a:latin typeface="..."/> + <a:ea .../> + <a:cs .../>.
    content = content.replace(
      /typeface="([^"]+)"/g,
      (m, face) => (preserve.has(face) ? m : 'typeface="Times New Roman"'),
    );

    zip.file(part, content);
  }
}

// ─── Specific Responsibilities (per-owner title + description) ────────

/**
 * Inject a "Specific Responsibilities" section into the generated agreement
 * when one or more owners have a title or responsibilities populated via
 * Step 6 of the questionnaire.
 *
 * Prior to this, Step 6 collected these fields, Airtable stored them, but
 * the generated document never mentioned them — the user's intent was lost.
 *
 * The section is injected as a new paragraph block immediately after the
 * paragraph that contains an entity-specific anchor:
 *   - Corp: the "The initial Officers shall be ..." sentence (which the
 *           Officers-inline fix already rewrote; we piggyback on that).
 *   - LLC:  the Manager-designation paragraph (`... the "Managers")`).
 *
 * No-op if no owner has either a title or a description filled in.
 */
/**
 * Replace the §10.6 Officers list (template ships ONE paragraph with
 * `{{shareholder_1_name}}` + 3 hardcoded tabs + "President and Chief
 * Executive Officer") with one paragraph per officer the user supplied.
 * Each line: bold name, tab to position 3000 (≈2.1"), bold title.
 *
 * Anchor on the literal "President and Chief Executive Officer" since
 * that string is the unique invariant in the template — not present
 * elsewhere in the rendered doc.
 */
function renderOfficersList(
  xml: string,
  answers: QuestionnaireAnswers,
): string {
  if (!answers.officers || answers.officers.length === 0) return xml;
  const officers = answers.officers.filter((o) => o && o.name);
  if (officers.length === 0) return xml;

  const anchor = "President and Chief Executive Officer";
  const idx = xml.indexOf(anchor);
  if (idx < 0) return xml;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (pStart < 0 || pEnd <= pStart) return xml;

  // Render as a 2-col borderless table (col1 right-aligned names, col2
  // left-aligned titles) centered horizontally on the page. This keeps
  // names + titles aligned across rows AND centers the whole block —
  // jc=center on individual paragraphs would center each line
  // independently, breaking column alignment as Name lengths vary.
  const rPr =
    "<w:rPr>" +
    '<w:b w:val="1"/><w:bCs w:val="1"/>' +
    '<w:vertAlign w:val="baseline"/>' +
    '<w:rtl w:val="0"/>' +
    "</w:rPr>";

  const buildCell = (text: string, jcVal: "right" | "left", colW: number) =>
    `<w:tc>` +
    `<w:tcPr>` +
    `<w:tcW w:w="${colW}" w:type="dxa"/>` +
    `<w:tcBorders>` +
    `<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>` +
    `</w:tcBorders>` +
    `</w:tcPr>` +
    `<w:p>` +
    `<w:pPr>` +
    `<w:jc w:val="${jcVal}"/>` +
    `<w:rPr><w:vertAlign w:val="baseline"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>` +
    `</w:p>` +
    `</w:tc>`;

  const COL1_W = 2200; // ~1.53"
  const COL2_W = 2200; // ~1.53"
  const TABLE_W = COL1_W + COL2_W;

  const rows = officers
    .map(
      (o) =>
        `<w:tr>${buildCell(xmlEscape(o.name), "right", COL1_W)}` +
        `<w:r>` + // not used; placeholder removed below
        `</w:r>` +
        `${buildCell("  " + xmlEscape(o.title || ""), "left", COL2_W)}` +
        `</w:tr>`,
    )
    .join("")
    .replace(/<w:r>\s*<\/w:r>/g, ""); // strip placeholder

  const table =
    `<w:tbl>` +
    `<w:tblPr>` +
    `<w:tblW w:w="${TABLE_W}" w:type="dxa"/>` +
    `<w:jc w:val="center"/>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblLook w:val="0000"/>` +
    `</w:tblPr>` +
    `<w:tblGrid>` +
    `<w:gridCol w:w="${COL1_W}"/>` +
    `<w:gridCol w:w="${COL2_W}"/>` +
    `</w:tblGrid>` +
    rows +
    `</w:tbl>` +
    // Trailing empty paragraph so the next section header doesn't
    // collide with the table layout.
    `<w:p><w:pPr><w:jc w:val="both"/></w:pPr></w:p>`;

  return xml.substring(0, pStart) + table + xml.substring(pEnd);
}

function injectResponsibilitiesSection(
  xml: string,
  owners: Owner[],
  isCorp: boolean,
): string {
  const withResp = owners.filter(
    (o) => (o.title || "").trim() || (o.responsibilities || "").trim(),
  );
  if (withResp.length === 0) return xml;

  // Corp anchor: "Agreements with Officers" is unique to Article X's last
  // sub-section (10.4 in the template), so the injected section lands at
  // the end of Article X — where "who does what" content semantically
  // belongs. The previous anchor ("The initial Officers shall be") matched
  // inside Article I's 1.7 Officers DEFINITION paragraph (the only place
  // that phrase appears in the template), placing the responsibilities
  // inside the glossary of defined terms — visually and structurally
  // wrong.
  // LLC anchor is inside the Manager-designation paragraph — "serve as the
  // Managers" is short and stable across 1/2-manager variants.
  const anchor = isCorp
    ? "Agreements with Officers"
    : "serve as the Managers";

  const anchorIdx = xml.indexOf(anchor);
  if (anchorIdx < 0) return xml;

  // Match the formatting of the surrounding paragraph so the inserted block
  // visually blends in (same font size, indent, line spacing, etc.).
  const fmt = extractFormatting(xml, anchor);

  const heading = isCorp
    ? "Specific Responsibilities of Shareholders."
    : "Specific Responsibilities of Members.";
  const intro = isCorp
    ? "The Shareholders have agreed to allocate the following specific responsibilities:"
    : "The Members have agreed to allocate the following specific responsibilities:";

  const lines = withResp.map((o, i) => {
    // (a), (b), (c), ... — will roll over past 'z' but unlikely for 6-owner max.
    const label = String.fromCharCode(97 + (i % 26));
    const title = (o.title || "").trim();
    const desc = (o.responsibilities || "").trim();
    if (title && desc) return `(${label}) ${o.full_name}, as ${title}: ${desc}`;
    if (title) return `(${label}) ${o.full_name}, as ${title}.`;
    return `(${label}) ${o.full_name}: ${desc}`;
  });

  // Give the section a distinct visual style so it doesn't look like a
  // runaway continuation of the preceding Officers paragraph:
  //   - heading: bold + underlined (matches other sub-section headings)
  //   - intro and list items: plain body weight
  //   - list items: slight first-line indent so (a), (b), (c) stand out
  const boldUnderlineRPr = fmt.rPr
    ? fmt.rPr.replace(
        /<\/w:rPr>/,
        '<w:b w:val="1"/><w:bCs w:val="1"/><w:u w:val="single"/></w:rPr>',
      )
    : '<w:rPr><w:b w:val="1"/><w:bCs w:val="1"/><w:u w:val="single"/></w:rPr>';

  // Ensure heading and list items have a small top-space so the section
  // breathes — 120 twips (~6pt) of spacing before each.
  const spacedPPr = fmt.pPr
    ? fmt.pPr.replace(
        /<\/w:pPr>/,
        '<w:spacing w:before="120"/></w:pPr>',
      )
    : '<w:pPr><w:spacing w:before="120"/></w:pPr>';

  // Strip the Heading3 style from intro + list-item paragraphs so the
  // sequential renumber pass only numbers the section HEADING (e.g. 10.5
  // Specific Responsibilities of Shareholders), leaving the intro and
  // (a)/(b)/(c) list items as unnumbered body text — otherwise every
  // list item would become its own numbered sub-section (10.6, 10.7, …)
  // which is wrong both visually and legally.
  const bodyPPr = (fmt.pPr || '<w:pPr></w:pPr>')
    .replace(/<w:pStyle w:val="Heading3"\/>/g, '');

  const paragraphs =
    buildFormattedParagraph(heading, spacedPPr, boldUnderlineRPr) +
    buildFormattedParagraph(intro, bodyPPr, fmt.rPr) +
    lines
      .map((line) => buildFormattedParagraph(line, bodyPPr, fmt.rPr))
      .join("");

  // Insert after the closing </w:p> of the anchor's paragraph.
  const pEnd = xml.indexOf("</w:p>", anchorIdx);
  if (pEnd < 0) return xml;
  const insertAt = pEnd + "</w:p>".length;
  return xml.substring(0, insertAt) + paragraphs + xml.substring(insertAt);
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

    // Templates exported from Google Docs ship every body paragraph with an
    // EXPLICIT `<w:keepNext w:val="0"/>` (disabled). If we early-out on
    // "has keepNext", the heading keeps val=0 → Word allows a page break
    // immediately after it (orphan heading at bottom of page). Instead:
    //   - existing val="0" → replace with bare <w:keepNext/> (val=1 implicit)
    //   - existing val="1" or bare <w:keepNext/> → already correct, no-op
    //   - no keepNext at all → insert one
    if (/<w:keepNext\s+w:val="0"\s*\/>/.test(fullMatch)) {
      return fullMatch.replace(
        /<w:keepNext\s+w:val="0"\s*\/>/,
        "<w:keepNext/>",
      );
    }
    if (/<w:keepNext(?:\s+w:val="1")?\s*\/>/.test(fullMatch)) {
      return fullMatch; // already enabled
    }

    // No keepNext present: insert one.
    if (fullMatch.includes("<w:pPr>")) {
      return fullMatch.replace("<w:pPr>", "<w:pPr><w:keepNext/>");
    } else {
      return fullMatch.replace("<w:p>", "<w:p><w:pPr><w:keepNext/></w:pPr>");
    }
  });
}

/**
 * Propagate keepNext through empty separator paragraphs that immediately
 * follow a paragraph with keepNext. Without this, the chain
 *   heading (keepNext) → empty separator → body
 * breaks because the empty separator has no keepNext, so Word can split
 * between empty and body — the heading lands at the bottom of the page
 * with the body on the next page (the §10.3 Indemnification orphan that
 * Haiku visual-review surfaced).
 *
 * Algorithm: parse paragraphs in document order. For each paragraph with
 * keepNext=1, look ahead at the next paragraph. If it's empty (no
 * substantive text content), force keepNext=1 on it too. Continue
 * forward until we hit a non-empty paragraph (which already has its own
 * keepNext rules, or doesn't need one).
 */
function chainKeepNextThroughEmpties(xml: string): string {
  // Find all paragraph spans.
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  type Span = { start: number; end: number; body: string; full: string };
  const paras: Span[] = [];
  let m;
  while ((m = paraRe.exec(xml))) {
    paras.push({ start: m.index, end: m.index + m[0].length, body: m[1], full: m[0] });
  }

  // Walk forward, collecting indexes that need keepNext added.
  //
  // Restrict propagation to ORPHAN-RISK headings only:
  //   - ARTICLE-style centered captions ("ARTICLE I: …")
  //   - Title-only §X.Y headings (text matches "N.M Title." with NO
  //     body following the period in the same paragraph)
  //
  // Inline-titled §X.Y headings ("1.1 Act.  Florida Business…") have
  // their body in the same paragraph — there's no orphan-title risk,
  // and chaining keepNext through their trailing empty separator joins
  // the entire article into one unbreakable block (e.g. ARTICLE I's 11
  // §1.x sections all chained, leaving §1.1 unable to fit at the bottom
  // of the previous page → big empty gap and a half-blank page).
  const ARTICLE_RE = /^ARTICLE\s+[IVXLCDM]+[:.\s]/;
  const INLINE_TITLED_RE = /^\d+\.\d+\s+[A-Z][\w\s'’,&-]+\.\s+\S/;
  const needKeepNext = new Set<number>();
  for (let i = 0; i < paras.length - 1; i++) {
    const cur = paras[i];
    const hasKN = /<w:keepNext(?:\s+w:val="1")?\s*\/>/.test(cur.full);
    if (!hasKN) continue;
    const curText = (cur.body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    if (INLINE_TITLED_RE.test(curText)) continue;
    // Heuristic: source must look like an orphan-risk caption. ARTICLE
    // captions, title-only headings, or true empty separators with
    // their own keepNext (already in a chain we should extend).
    const looksLikeCaption =
      ARTICLE_RE.test(curText) ||
      /^\d+\.\d+\s+[A-Z][\w\s'’,&-]*\.?\s*$/.test(curText) ||
      curText === "";
    if (!looksLikeCaption) continue;
    // Walk forward through empty paragraphs and add keepNext.
    let j = i + 1;
    while (j < paras.length) {
      const nxt = paras[j];
      const text = (nxt.body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
        .map((t) => t.replace(/<[^>]+>/g, ""))
        .join("")
        .trim();
      if (text) break; // non-empty: it has its own keepNext logic
      const nxtHasKN = /<w:keepNext(?:\s+w:val="1")?\s*\/>/.test(nxt.full);
      if (!nxtHasKN) needKeepNext.add(j);
      j++;
    }
  }

  if (needKeepNext.size === 0) return xml;

  // Apply the changes in REVERSE so earlier offsets stay valid.
  const sorted = [...needKeepNext].sort((a, b) => b - a);
  for (const idx of sorted) {
    const p = paras[idx];
    let fixed = p.full;
    if (/<w:keepNext\s+w:val="0"\s*\/>/.test(fixed)) {
      fixed = fixed.replace(/<w:keepNext\s+w:val="0"\s*\/>/, "<w:keepNext/>");
    } else if (/<w:pPr>/.test(fixed)) {
      fixed = fixed.replace("<w:pPr>", "<w:pPr><w:keepNext/>");
    } else {
      fixed = fixed.replace(/(<w:p\b[^>]*>)/, "$1<w:pPr><w:keepNext/></w:pPr>");
    }
    if (fixed !== p.full) {
      xml = xml.substring(0, p.start) + fixed + xml.substring(p.end);
    }
  }
  return xml;
}

// ─── Formatted Paragraph Builder ─────────────────────────────────────

/**
 * Extract paragraph and run formatting properties from a reference paragraph
 * in the XML. Returns the pPr and rPr XML strings to use for new paragraphs.
 */
function extractFormatting(xml: string, nearText: string): { pPr: string; rPr: string } {
  const idx = xml.indexOf(nearText);
  if (idx < 0) return { pPr: "", rPr: "" };

  const pStart = paragraphStartBefore(xml, idx);
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
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

/**
 * Escape a plain string for safe inclusion inside a <w:t> element or any XML
 * text node. Only `&`, `<`, and `>` strictly need escaping inside element
 * content; we also escape quotes for safety if the string later ends up in
 * an attribute value. This is idempotent for already-escaped entities
 * because `&amp;lt;` would just become `&amp;amp;lt;` — so callers must pass
 * raw user strings, not pre-escaped XML.
 */
function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build a formatted paragraph and return it as a string to insert
 * after closing the current paragraph's text element.
 * Usage: xmlTextReplace(xml, "anchor text", "anchor text" + closeParagraphAndInsert(newText, pPr, rPr))
 */
function closeParagraphAndInsert(text: string, pPr: string, rPr: string): string {
  // Close current text/run/paragraph, insert new formatted paragraph,
  // then reopen for remaining text. The repairXml function will clean up
  // any unclosed tags if there's no remaining text.
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
