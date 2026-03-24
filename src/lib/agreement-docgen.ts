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

  // Map owners to the hardcoded member_01/member_02 slots
  for (let i = 0; i < Math.min(answers.owners_list.length, 2); i++) {
    const num = String(i + 1).padStart(2, "0");
    data[`member_${num}_full_name`] = answers.owners_list[i].full_name;
    data[`member_${num}_amount`] = formatCurrency(
      answers.owners_list[i].capital_contribution
    );
    data[`member_${num}_pct`] = `${answers.owners_list[i].shares_or_percentage}%`;
  }

  doc.render(data);

  // Get the rendered XML for post-processing
  const renderedZip = doc.getZip();
  let xml = renderedZip.file("word/document.xml")!.asText();

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
    // The LLC template has specific spending thresholds
    xml = xmlTextReplace(xml, "$10,000.00", `$${threshold}`);
    xml = xmlTextReplace(xml, "$2,000.00", `$${formatCurrency(Math.min(2000, answers.major_spending_threshold))}`);
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
    const shares = Math.round(owner.shares_or_percentage);
    const pct = ((shares / totalShares) * 100).toFixed(2);
    shareholderData[`shareholder_${idx}_name`] = owner.full_name;
    shareholderData[`shareholder_${idx}_shares`] = String(shares);
    shareholderData[`shareholder_${idx}_contribution`] = formatCurrency(owner.capital_contribution);
    shareholderData[`shareholder_${idx}_pct`] = pct;
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
    corp_name: answers.entity_name,
    corp_name_short: answers.entity_name.replace(/\s+(Inc\.|LLC|Corp\.?)$/i, ""),
    effective_date: formatDate(answers.date_of_formation),
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

  // Voting text replacements
  xml = applyCorpVotingReplacements(xml, answers);

  // Bank account text (additional replacements beyond the template var)
  xml = applyCorpBankAccountText(xml, answers);

  // Conditional section removal
  xml = removeCorpConditionalSections(xml, answers);

  // Supermajority definition (Sec 1.11) — if present
  if (answers.supermajority_threshold) {
    xml = xmlTextReplace(
      xml,
      "greater than __%",
      `greater than ${answers.supermajority_threshold}%`,
      false
    );
  }

  renderedZip.file("word/document.xml", xml);

  return Buffer.from(
    renderedZip.generate({
      type: "nodebuffer",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  );
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
    // Sec 7.3 - Shareholder loans
    {
      find: "Majority consent of the Shareholders",
      replace: `${votingText(answers.shareholder_loans_voting)} consent of the Shareholders`,
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
