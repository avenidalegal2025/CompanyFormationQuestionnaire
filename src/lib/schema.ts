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
 * Helper: coerce numbers that may come as strings with thousand separators,
 * e.g. "10,000" -> 10000. Rejects negatives and non-numeric input.
 */
const sharesCountCoerced = z
  .preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    const s = String(val).replace(/[^\d]/g, ""); // strip anything not a digit
    if (s === "") return undefined;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().int().nonnegative())
  .optional();

export const CompanySchema = z.object({
  formationState: z.string().optional(),

  entityType: EntityTypeEnum.optional(),

  companyNameBase: z.string().optional(),
  companyName: z.string().optional(),

  /** Describir fin de la empresa */
  businessPurpose: z.string().optional(),

  /** Número de acciones (solo C-Corp). Coerced int; allows "10,000" style input. */
  sharesCount: sharesCountCoerced,

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
  ownership: z.union([z.number(), z.string()]).optional(), // allow user input before normalization
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const OwnersSchema = z.array(OwnerSchema);

/** ------------ Admin (Step 4) ------------ */
/* Keep toggles & counts typed; allow extra dynamic keys (director1Name, etc.) */
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
  .and(z.record(z.string(), z.unknown()).optional());

/** ------------ Banking ------------ */
export const BankingSchema = z.object({
  needBankAccount: z.enum(["Yes", "No"]).optional(),
  bankPreference: z.string().optional(), // e.g., Mercury / Chase / Otro
});

/** ------------ Attachments ------------ */
export const AttachmentsSchema = z.object({
  idDocumentUrl: z.string().url().optional(),
  proofOfAddressUrl: z.string().url().optional(),
});

/** ------------ All steps ------------ */
export const AllStepsSchema = z.object({
  profile: ProfileSchema.optional(),
  company: CompanySchema.optional(),
  owners: OwnersSchema.optional(),
  admin: AdminSchema.optional(),
  banking: BankingSchema.optional(),
  attachments: AttachmentsSchema.optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type Owner = z.infer<typeof OwnerSchema>;
export type Admin = z.infer<typeof AdminSchema>;
export type Banking = z.infer<typeof BankingSchema>;
export type Attachments = z.infer<typeof AttachmentsSchema>;
export type AllSteps = z.infer<typeof AllStepsSchema>;