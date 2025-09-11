import { z } from "zod"

export const formationStates = [
  "Florida",
  "Delaware",
  "Wyoming",
  "Texas",
  "Nevada",
  "New Mexico",
  "Georgia",
  "California",
  "Arizona",
] as const

export const entityTypes = ["LLC", "C-Corp"] as const

const CompanyBase = z.object({
  companyNameBase: z.string().min(1, "Requerido"),
  companyName: z.string().min(1, "Requerido"),
  entityType: z.enum(entityTypes, {
    errorMap: () => ({ message: "Selecciona LLC o C-Corp" }),
  }),
  formationState: z.enum(formationStates, {
    errorMap: () => ({ message: "Selecciona un estado" }),
  }),

  // Toggles
  hasUsaAddress: z.enum(["Yes", "No"], {
    errorMap: () => ({ message: "Selecciona Sí o No" }),
  }),
  hasUsPhone: z.enum(["Yes", "No"]).default("No"),

  // Dirección
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),

  // Teléfono
  usPhoneNumber: z.string().optional(),

  // Otros
  businessPurpose: z.string().min(1, "Requerido"),
})

const CompanySchema = CompanyBase.superRefine((data, ctx) => {
  // Si requiere dirección USA, valida campos obligatorios
  if (data.hasUsaAddress === "Yes") {
    const requiredFields: (keyof typeof data)[] = [
      "addressLine1",
      "city",
      "state",
      "postalCode",
      "country",
    ]
    for (const f of requiredFields) {
      const val = (data as any)[f]
      if (!val || String(val).trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [f],
          message: "Requerido",
        })
      }
    }
  }

  // Si requiere teléfono USA, valida número
  if (data.hasUsPhone === "Yes") {
    const phone = data.usPhoneNumber?.trim()
    if (!phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["usPhoneNumber"],
        message: "Requerido",
      })
    } else {
      // acepta solo dígitos (7 a 15 por seguridad)
      if (!/^\d{7,15}$/.test(phone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["usPhoneNumber"],
          message: "Solo dígitos (7-15)",
        })
      }
    }
  }
})

const OwnerSchema = z.object({
  fullName: z.string().min(1, "Requerido"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(7, "Teléfono inválido"),
  ownership: z.number().min(0).max(100),
})

const BankingSchema = z.object({
  needBankAccount: z.string().min(1, "Requerido"),
  bankPreference: z.string().optional().nullable(),
})

const AttachmentsSchema = z.object({
  idDocumentUrl: z.string().optional().nullable(),
  proofOfAddressUrl: z.string().optional().nullable(),
})

export const AllStepsSchema = z.object({
  company: CompanySchema,
  owners: z.array(OwnerSchema).min(1, "Agrega al menos un propietario"),
  banking: BankingSchema,
  attachments: AttachmentsSchema,
})

export type AllSteps = z.infer<typeof AllStepsSchema>