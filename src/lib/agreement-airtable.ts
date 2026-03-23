import Airtable from "airtable";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || "";
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || "";
const TABLE_NAME = "Shareholder_Registry_Agreement";

function getBase() {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured — skipping sync");
    return null;
  }
  return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
}

/** Map voting code to Airtable select label */
function votingLabel(v: string): string {
  switch (v) {
    case "supermajority":
      return "Super Majority";
    case "unanimous":
      return "Unanimous";
    default:
      return "Majority";
  }
}

/** Map distribution code to Airtable select label */
function distributionLabel(v: string): string {
  switch (v) {
    case "semi_annual":
      return "Semi-Annual";
    case "annual":
      return "Annual";
    case "discretion":
      return "Board Discretion";
    default:
      return "Quarterly";
  }
}

/** Map family transfer code to Airtable select label */
function familyTransferLabel(v: string): string {
  switch (v) {
    case "majority":
      return "Majority";
    case "supermajority":
      return "Super Majority";
    case "unanimous":
      return "Unanimous";
    default:
      return "Free";
  }
}

/** Map management type code to Airtable select label */
function managementLabel(v: string): string {
  return v === "member" ? "Member-Managed" : "Manager-Managed";
}

export interface AgreementSyncData {
  session_id: string;
  entity_type: string;
  entity_name: string;
  state_of_formation: string;
  county: string;
  management_type?: string;
  // Voting
  sale_of_company_voting: string;
  major_decisions_voting: string;
  dissolution_voting: string;
  new_member_admission_voting: string;
  officer_removal_voting: string;
  additional_capital_voting: string;
  shareholder_loans_voting: string;
  // Thresholds
  majority_threshold: number;
  supermajority_threshold?: number;
  major_spending_threshold: number;
  // Bank
  bank_signees: string;
  // Transfer
  family_transfer: string;
  right_of_first_refusal: boolean;
  rofr_offer_period?: number;
  death_incapacity_forced_sale: boolean;
  drag_along: boolean;
  tag_along: boolean;
  // Non-compete
  include_noncompete: boolean;
  noncompete_duration?: number;
  noncompete_scope?: string;
  include_nonsolicitation: boolean;
  include_confidentiality: boolean;
  // Distribution
  distribution_frequency: string;
  min_tax_distribution?: number;
  // Meta
  status: string;
  document_url?: string;
}

/**
 * Sync agreement questionnaire answers to the existing
 * Shareholder_Registry_Agreement table in Airtable.
 *
 * Finds record by Agreement Session ID or creates a new one.
 */
export async function syncToAirtable(
  data: AgreementSyncData
): Promise<string | null> {
  const base = getBase();
  if (!base) return null;

  try {
    // Build the fields object matching Airtable column names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: Record<string, any> = {
      "Agreement Session ID": data.session_id,
      "full_county": data.county,
      // Voting (singleSelect — Airtable REST API accepts plain strings)
      "Sale of Company Voting": votingLabel(data.sale_of_company_voting),
      "Major Decisions Voting": votingLabel(data.major_decisions_voting),
      "Dissolution Voting": votingLabel(data.dissolution_voting),
      "New Member Voting": votingLabel(data.new_member_admission_voting),
      "Officer Removal Voting": votingLabel(data.officer_removal_voting),
      "Capital Calls Voting": votingLabel(data.additional_capital_voting),
      "Loans Voting": votingLabel(data.shareholder_loans_voting),
      // Thresholds
      "Majority Threshold %": data.majority_threshold,
      "Spending Threshold": data.major_spending_threshold,
      // Bank
      "Bank Signees": data.bank_signees === "two" ? "Two" : "One",
      // Transfer
      "Family Transfer": familyTransferLabel(data.family_transfer),
      "ROFR": data.right_of_first_refusal,
      "Death Forced Sale": data.death_incapacity_forced_sale,
      "Drag Along": data.drag_along,
      "Tag Along": data.tag_along,
      // Non-compete
      "Non-Compete": data.include_noncompete,
      "Non-Solicitation": data.include_nonsolicitation,
      "Confidentiality NDA": data.include_confidentiality,
      // Distribution
      "Distribution Frequency": distributionLabel(data.distribution_frequency),
      // Meta
      "Agreement Status":
        data.status === "doc_generated"
          ? "Doc Generated"
          : data.status === "completed"
            ? "Completed"
            : "In Progress",
    };

    // Optional fields
    if (data.supermajority_threshold) {
      fields["Supermajority Threshold %"] = data.supermajority_threshold;
    }
    if (data.right_of_first_refusal && data.rofr_offer_period) {
      fields["ROFR Period Days"] = data.rofr_offer_period;
    }
    if (data.include_noncompete) {
      if (data.noncompete_duration) {
        fields["Non-Compete Duration Years"] = data.noncompete_duration;
      }
      if (data.noncompete_scope) {
        fields["Non-Compete Scope"] = data.noncompete_scope;
      }
    }
    if (data.min_tax_distribution) {
      fields["Min Tax Distribution %"] = data.min_tax_distribution;
    }
    if (data.management_type) {
      fields["Management Type"] = managementLabel(data.management_type);
    }
    if (data.document_url) {
      fields["Agreement Document URL"] = data.document_url;
    }

    // Try to find existing record by session ID
    const existing = await new Promise<Airtable.Records<Airtable.FieldSet>>(
      (resolve, reject) => {
        base(TABLE_NAME)
          .select({
            filterByFormula: `{Agreement Session ID} = '${data.session_id}'`,
            maxRecords: 1,
          })
          .firstPage((err, records) => {
            if (err) reject(err);
            else resolve(records || []);
          });
      }
    );

    if (existing.length > 0) {
      // Update existing record
      const recordId = existing[0].id;
      await new Promise<void>((resolve, reject) => {
        base(TABLE_NAME).update(
          recordId,
          fields as Partial<Airtable.FieldSet>,
          (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      console.log(`Airtable: updated record ${recordId}`);
      return recordId;
    } else {
      // Create new record
      const record = await new Promise<Airtable.Record<Airtable.FieldSet>>(
        (resolve, reject) => {
          base(TABLE_NAME).create(
            fields as Partial<Airtable.FieldSet>,
            (err: Error | null, record?: Airtable.Record<Airtable.FieldSet>) => {
              if (err) reject(err);
              else resolve(record!);
            }
          );
        }
      );
      console.log(`Airtable: created record ${record.id}`);
      return record.id;
    }
  } catch (error) {
    console.error("Airtable sync error:", error);
    return null;
  }
}
