// src/lib/schema.ts
import { z } from "zod";

/** ------------ Profile (Step 1) ------------ */
export const ProfileSchema = z.object({
  fullName: z.string().min(1, "Nombre requerido").optional(),
  email: z.string().email("Email inválido").optional(),
});

/** ------------ Company (Step 2) ------------ */
export const EntityTypeEnum = z.enum(["LLC", "C-Corp"]);

/**
 * Helper: accept numbers typed as strings (e.g. "1,000")
 * Strip commas/spaces and parse to number when possible.
 */
const numberFromInput = z.preprocess((val) => {
  if (typeof val === "string") {
    const cleaned = val.replace(/[, ]+/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return val;
}, z.number().int().min(1, "Debe ser un entero positivo"));

export const CompanySchema = z.object({
  formationState: z.string().optional(),

  entityType: EntityTypeEnum.optional(),
  entitySuffix: z.string().optional(),

  companyNameBase: z.string().optional(),
  companyName: z.string().optional(),

  businessPurpose: z.string().optional(),

  /** Only relevant for C-Corp, but stored on the model */
  numberOfShares: numberFromInput.optional(),

  // Address fields
  hasUsaAddress: z.enum(["Yes", "No"]).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),

  // Phone
  hasUsPhone: z.enum(["Yes", "No"]).optional(),
  usPhoneNumber: z.string().optional(),
});

/** ------------ Owners (Step 3) ------------ */
export const OwnerSchema = z.object({
  fullName: z.string().optional(),
  ownership: z.union([z.number(), z.string()]).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const OwnersSchema = z.array(OwnerSchema);

/** ------------ Admin (Step 4) ------------ */
export const AdminSchema = z
  .object({
    // Directors (C-Corp)
    directorsAllOwners: z.enum(["Yes", "No"]).optional(),
    directorsCount: z.number().int().min(1).optional(),

    // Officers (C-Corp)
    officersAllOwners: z.enum(["Yes", "No"]).optional(),
    officersCount: z.number().int().min(1).optional(),

    // Managers (LLC)
    managersAllOwners: z.enum(["Yes", "No"]).optional(),
    managersCount: z.number().int().min(1).optional(),
  })
  // Allow dynamic keys like director1Name, officer1Address, etc.
  .and(z.record(z.string(), z.unknown()).optional());

/** ------------ Banking ------------ */
export const BankingSchema = z.object({
  needBankAccount: z.enum(["Yes", "No"]).optional(),
  bankPreference: z.string().optional(),
});

/** ------------ Attachments ------------ */
export const AttachmentsSchema = z.object({
  idDocumentUrl: z.string().url().optional(),
  proofOfAddressUrl: z.string().url().optional(),
});

/** ------------ Agreement (post-summary) ------------ */
export const AgreementSchema = z
  .object({
    wants: z.enum(["Yes", "No"]).optional(),
    // C-Corp specific fields (owners & roles)
    corp_capitalPerOwner: z.string().optional(),
    corp_specificResponsibilities: z.string().optional(),
    corp_hoursCommitment: z.string().optional(),
    // C-Corp capital & loans
    corp_newShareholdersAdmission: z.string().optional(),
    corp_moreCapitalProcess: z.string().optional(),
    corp_withdrawFundsPolicy: z.string().optional(),
    corp_shareholderLoans: z.string().optional(),
    // C-Corp governance & decisions
    corp_saleDecisionThreshold: z.string().optional(),
    corp_bankSigners: z.string().optional(),
    corp_majorDecisionThreshold: z.string().optional(),
    corp_restrictions: z.string().optional(),
    corp_nonCompete: z.string().optional(),
    corp_voteTieBreaker: z.string().optional(),
    // C-Corp shares & succession
    corp_rofr: z.string().optional(),
    corp_transferToRelatives: z.string().optional(),
    corp_incapacityHeirsPolicy: z.string().optional(),
    corp_divorceBuyoutPolicy: z.string().optional(),
    corp_tagDragRights: z.string().optional(),
    corp_additionalClauses: z.string().optional(),

    // LLC specific fields (owners & roles)
    llc_capitalContributions: z.string().optional(),
    llc_managingMembers: z.string().optional(),
    llc_specificRoles: z.string().optional(),
    // LLC capital & loans
    llc_newMembersAdmission: z.string().optional(),
    llc_additionalContributions: z.string().optional(),
    llc_withdrawContributions: z.string().optional(),
    llc_memberLoans: z.string().optional(),
    // LLC governance & decisions
    llc_companySaleDecision: z.string().optional(),
    llc_taxPartner: z.string().optional(),
    llc_bankSigners: z.string().optional(),
    llc_majorDecisions: z.string().optional(),
    llc_minorDecisions: z.string().optional(),
    llc_managerRestrictions: z.string().optional(),
    llc_nonCompete: z.string().optional(),
    llc_deadlockResolution: z.string().optional(),
    llc_keyManInsurance: z.string().optional(),
    llc_disputeResolution: z.string().optional(),
    // LLC actions & succession
    llc_rofr: z.string().optional(),
    llc_incapacityHeirsPolicy: z.string().optional(),
    llc_newPartnersAdmission: z.string().optional(),
    llc_dissolutionDecision: z.string().optional(),
    llc_specificTerms: z.string().optional(),
  })
  .and(z.record(z.string(), z.unknown()).optional());

/** ------------ All steps ------------ */
export const AllStepsSchema = z.object({
  profile: ProfileSchema.optional(),
  company: CompanySchema.optional(),
  owners: OwnersSchema.optional(),
  ownersCount: z.number().int().min(1).max(6).optional(),
  admin: AdminSchema.optional(),
  banking: BankingSchema.optional(),
  attachments: AttachmentsSchema.optional(),
  agreement: AgreementSchema.optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type Owner = z.infer<typeof OwnerSchema>;
export type Admin = z.infer<typeof AdminSchema>;
export type Banking = z.infer<typeof BankingSchema>;
export type Attachments = z.infer<typeof AttachmentsSchema>;
export type Agreement = z.infer<typeof AgreementSchema>;
export type AllSteps = z.infer<typeof AllStepsSchema>;