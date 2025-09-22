// src/app/api/submit/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic"; // optional; fine for Amplify

// ---- Zod schema for the full payload (trim to what you actually send) ----
const OwnerSchema = z.object({
  fullName: z.string().min(1),
  ownership: z.number().min(0).max(100),
  email: z.string().email().optional().or(z.literal("")).optional(),
  phone: z.string().optional().or(z.literal("")).optional(),
  addressFull: z.string().optional().or(z.literal("")).optional(),
});

const CompanySchema = z.object({
  entityType: z.enum(["LLC", "C-Corp"]),
  companyName: z.string().min(1),
  formationState: z.string().min(1),
  businessPurpose: z.string().optional().or(z.literal("")).optional(),
  addressLine1: z.string().optional().or(z.literal("")).optional(),
  addressLine2: z.string().optional().or(z.literal("")).optional(),
  city: z.string().optional().or(z.literal("")).optional(),
  state: z.string().optional().or(z.literal("")).optional(),
  postalCode: z.string().optional().or(z.literal("")).optional(),
  country: z.string().optional().or(z.literal("")).optional(),
  einNeeded: z.enum(["Yes", "No"]).optional().default("No"),
});

const BankingSchema = z.object({
  needBankAccount: z.enum(["Yes", "No"]).default("No"),
  bankPreference: z.string().optional().or(z.literal("")).optional(),
});

const AttachmentsSchema = z.object({
  idDocumentUrl: z.string().url().optional().or(z.literal("")).optional(),
  proofOfAddressUrl: z.string().url().optional().or(z.literal("")).optional(),
});

const PayloadSchema = z.object({
  company: CompanySchema,
  owners: z.array(OwnerSchema).min(1),
  banking: BankingSchema,
  attachments: AttachmentsSchema.optional().default({}),
});

type Payload = z.infer<typeof PayloadSchema>;

// ---- Helper: build Airtable fields ----
function buildAirtableFields(data: Payload): Record<string, string | number> {
  const fields: Record<string, string | number> = {};

  // Company name targets
  if (data.company.entityType === "LLC") {
    fields["Nombre de la LLC"] = data.company.companyName;
    fields["Nombre de la C-Corp"] = "";
  } else {
    fields["Nombre de la LLC"] = "";
    fields["Nombre de la C-Corp"] = data.company.companyName;
  }

  fields["LLC o C-Corp"] = data.company.entityType === "C-Corp" ? "Corporation" : "LLC";
  fields["Estado de USA donde desea formar su empresa"] = data.company.formationState;

  // Business purpose
  if (data.company.businessPurpose) {
    fields["Business Purpose"] = data.company.businessPurpose;
  }

  // Address (single field in Airtable)
  const fullAddress = [
    data.company.addressLine1,
    data.company.addressLine2,
    data.company.city,
    data.company.state,
    data.company.postalCode,
    data.company.country,
  ]
    .filter(Boolean)
    .join(", ");
  if (fullAddress) fields["Dirección principal de la empresa"] = fullAddress;

  // EIN needed (adjust to your field naming if different)
  fields["EIN Needed"] = data.company.einNeeded;

  // Owners JSON (for audit)
  fields["Owners JSON"] = JSON.stringify(data.owners);

  // Split owners into columns (support up to N slots)
  const MAX_OWNER_SLOTS = 10;
  const limit = Math.min(data.owners.length, MAX_OWNER_SLOTS);
  for (let i = 0; i < limit; i++) {
    const o = data.owners[i];
    const idx = i + 1;
    fields[`Nombre completo del Propietario ${idx}`] = o.fullName;
    fields[`Porcentaje del Propietario ${idx}`] =
      typeof o.ownership === "number" ? o.ownership : Number(o.ownership ?? 0);
    if (o.email) fields[`Email del Propietario ${idx}`] = o.email;
    if (o.phone) fields[`Teléfono del Propietario ${idx}`] = o.phone;
  }

  // Banking
  fields["Need Bank Account"] = data.banking.needBankAccount;
  if (data.banking.bankPreference) {
    fields["Bank Preference"] = data.banking.bankPreference;
  }

  // Attachments (URLs as text)
  if (data.attachments?.idDocumentUrl) {
    fields["ID Document URL"] = data.attachments.idDocumentUrl;
  }
  if (data.attachments?.proofOfAddressUrl) {
    fields["Proof of Address URL"] = data.attachments.proofOfAddressUrl;
  }

  return fields;
}

// ---- POST handler ----
export async function POST(req: Request) {
  try {
    const bodyUnknown = (await req.json()) as unknown;
    const parsed = PayloadSchema.safeParse(bodyUnknown);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;

    if (!apiKey || !baseId || !tableName) {
      return NextResponse.json(
        { ok: false, error: "Missing Airtable env vars" },
        { status: 500 }
      );
    }

    const fields = buildAirtableFields(data);

    const res = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }] }),
        // Amplify/Node20 is fine with standard fetch
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: text }, { status: 502 });
    }

    const json = (await res.json()) as { records?: Array<{ id?: string }> };
    return NextResponse.json({ ok: true, recordId: json.records?.[0]?.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}