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

  // Add keepNext to all section headings to prevent page breaks between heading and body
  xml = addKeepNextToHeadings(xml);
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
        const byPStart = paragraphStartBefore(xml, lastByIdx);
        const byPEnd = xml.indexOf("</w:p>", lastByIdx);
        const nameStart = byPEnd >= 0 ? paragraphStartAtOrAfter(xml, byPEnd + 6) : -1;
        const namePEnd = nameStart >= 0 ? xml.indexOf("</w:p>", nameStart) : -1;
        if (byPStart < 0 || byPEnd < 0 || nameStart < 0 || namePEnd < 0) {
          // Bail out — can't locate both paragraphs cleanly.
          return xml;
        }

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

  return xml.substring(0, pEnd) + newPara + xml.substring(pEnd);
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
    { anchor: "Majority election to dissolve", letter: "A." },
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
  const newGridCols =
    '<w:gridCol w:w="2700"/>' + // Name
    '<w:gridCol w:w="1800"/>' + // Shares
    '<w:gridCol w:w="2250"/>' + // Capital
    '<w:gridCol w:w="2250"/>';  // Percentage
  tbl = tbl.replace(
    /(<w:tblGrid>)(?:<w:gridCol[^/]*\/>)+(<w:tblGridChange[\s\S]*?<\/w:tblGridChange>)?/,
    `$1${newGridCols}$2`,
  );

  // 4. Rewrite every row's cell widths (<w:tcW>) to match the new grid.
  //    Corp template has some cells with tcW and some without; normalize
  //    by ensuring each row's cells get the right tcW in order.
  tbl = tbl.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    const widths = [2700, 1800, 2250, 2250];
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

  // 6. Also add <w:keepNext/> to the paragraph IMMEDIATELY preceding the
  //    table so the "4.2 Initial Capital Contributions..." intro stays
  //    glued to the table instead of being orphaned on the previous page.
  let before = xml.substring(0, tblStart);
  const precedingPClose = before.lastIndexOf("</w:p>");
  if (precedingPClose >= 0) {
    const precedingPStart = paragraphStartBefore(before, precedingPClose);
    if (precedingPStart >= 0) {
      const precedingP = before.substring(precedingPStart, precedingPClose + "</w:p>".length);
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
