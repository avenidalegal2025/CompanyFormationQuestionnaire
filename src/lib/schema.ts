import { z } from "zod";

export const profileSchema = z.object({
  fullName: z.string().optional(),
  email: z.string().email().optional(),
});

export const companySchema = z.object({
  formationState: z.string().optional(),
  entityType: z.enum(["LLC", "C-Corp"]).optional(),
  companyNameBase: z.string().optional(),
  companyName: z.string().optional(),
  businessPurpose: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  usPhoneNumber: z.string().optional(),
});

export const ownerSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
});

export const adminSchema = z.object({
  directorsAllOwners: z.string().optional(),
  directorsCount: z.number().optional(),
  officersAllOwners: z.string().optional(),
  officersCount: z.number().optional(),
  managersAllOwners: z.string().optional(),
  managersCount: z.number().optional(),
});

export const allStepsSchema = z.object({
  profile: profileSchema.optional(),   // ✅ added this
  company: companySchema.optional(),
  owners: z.array(ownerSchema.optional()).optional(),
  admin: adminSchema.optional(),
});

export type AllSteps = z.infer<typeof allStepsSchema>;