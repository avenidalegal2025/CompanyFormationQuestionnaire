import { z } from "zod";

/**
 * Shared tiny enums used across the form
 */
export const YesNo = z.enum(["Yes", "No"]);
export type YesNo = z.infer<typeof YesNo>;

export const EntityType = z.enum(["LLC", "C-Corp"]);
export type EntityType = z.infer<typeof EntityType>;

/**
 * Company step
 */
export const CompanySchema = z.object({
  formationState: z.string().min(1, "Seleccione un estado"),
  entityType: EntityType,
  companyNameBase: z.string().optional().default(""),
  companyName: z.string().optional().default(""),
  businessPurpose: z.string().optional().default(""),

  hasUsaAddress: YesNo.optional().default("No"),
  addressLine1: z.string().optional().default(""),
  addressLine2: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  postalCode: z.string().optional().default(""),
  country: z.string().optional().default(""),

  einNeeded: YesNo.optional().default("No"),

  hasUsPhone: YesNo.optional().default("No"),
  usPhoneNumber: z.string().optional().default(""),
});

/**
 * Owners step
 */
export const OwnerSchema = z.object({
  fullName: z.string().min(1, "Nombre requerido"),
  ownership: z.number().min(0).max(100),
  email: z.string().email().optional().or(z.literal("")).default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  isManager: YesNo.optional().default("No"), // used in LLC flows sometimes
  isDirector: YesNo.optional().default("No"), // for C-Corp (optional)
});

export const OwnersSchema = z.array(OwnerSchema).min(1, "Agregue al menos un propietario");

/**
 * Banking step
 */
export const BankingSchema = z.object({
  needBankAccount: YesNo,
  bankPreference: z.string().optional().default(""),
});

/**
 * Attachments step
 */
export const AttachmentsSchema = z.object({
  idDocumentUrl: z.string().url().optional().or(z.literal("")).default(""),
  proofOfAddressUrl: z.string().url().optional().or(z.literal("")).default(""),
});

/**
 * Admin step
 *
 * We know a few explicit fields that your UI uses and we allow additional dynamic
 * keys like director1Name / director1Address / officer1Name / officer1Address, etc.
 */
export const AdminSchema = z
  .object({
    // LLC
    managersAllOwners: YesNo.optional().default("No"),
    managersCount: z.number().int().positive().optional().default(1),

    // C-Corp
    directorsAllOwners: YesNo.optional().default("Yes"),
    directorsCount: z.number().int().positive().optional().default(1),

    officersAllOwners: YesNo.optional().default("Yes"),
    officersCount: z.number().int().positive().optional().default(1),
  })
  .catchall(z.unknown()); // allow director1Name, director1Address, officer1Name, etc.

/**
 * Entire multi-step payload
 */
export const AllStepsSchema = z.object({
  company: CompanySchema,
  owners: OwnersSchema,
  banking: BankingSchema,
  attachments: AttachmentsSchema,
  admin: AdminSchema,
});

export type AllSteps = z.infer<typeof AllStepsSchema>;