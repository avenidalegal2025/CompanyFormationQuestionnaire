import { NextRequest, NextResponse } from "next/server";
import { AllStepsSchema, type AllSteps } from "@/lib/schema";

type AirtableCreateResponse = {
  records: { id: string }[];
};

export async function POST(req: NextRequest) {
  try {
    // Validate request body first
    const raw: unknown = await req.json();
    const parsed = AllStepsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body: AllSteps = parsed.data;

    // Env
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;

    if (!apiKey || !baseId || !tableName) {
      return NextResponse.json(
        { ok: false, error: "Missing Airtable env vars" },
        { status: 500 }
      );
    }

    // Build fields for Airtable (typed loosely as string/number/boolean)
    const fields: Record<string, string | number | boolean> = {};

    // Company name by entity type
    if (body.company.entityType === "LLC") {
      fields["Nombre de la LLC"] = body.company.companyName;
      fields["Nombre de la C-Corp"] = "";
    } else if (body.company.entityType === "C-Corp" || body.company.entityType === "Corporation") {
      fields["Nombre de la C-Corp"] = body.company.companyName;
      fields["Nombre de la LLC"] = "";
    } else {
      fields["Nombre de la LLC"] = body.company.companyName;
      fields["Nombre de la C-Corp"] = body.company.companyName;
    }

    fields["LLC o C-Corp"] = body.company.entityType;
    fields["Estado de USA donde desea formar su empresa"] = body.company.formationState;
    fields["Business Purpose"] = body.company.businessPurpose ?? "";

    const fullAddress = [
      body.company.addressLine1,
      body.company.addressLine2 ?? "",
      body.company.city ?? "",
      body.company.state ?? "",
      body.company.postalCode ?? "",
      body.company.country ?? "",
    ]
      .filter(Boolean)
      .join(", ");
    fields["Dirección principal de la empresa"] = fullAddress;

    // Optional EIN flag if present in your schema (keep if you have it)
    if ("einNeeded" in body.company) {
      fields["EIN Needed"] = (body.company as any).einNeeded ?? ""; // harmless if the field doesn't exist
    }

    // Banking
    fields["Need Bank Account"] = body.banking.needBankAccount;
    fields["Bank Preference"] = body.banking.bankPreference ?? "";

    // Attachment URLs
    fields["ID Document URL"] = body.attachments?.idDocumentUrl ?? "";
    fields["Proof of Address URL"] = body.attachments?.proofOfAddressUrl ?? "";

    // Owners JSON (store as string)
    const ownersJson = JSON.stringify(body.owners);
    // If you need to actually store JSON in Airtable text field, assign to a text column
    fields["Owners JSON"] = ownersJson;

    // Split owners into “Propietario n” columns (limit as needed)
    const MAX_OWNER_SLOTS = 10;
    const owners = body.owners ?? [];
    for (let i = 0; i < Math.min(owners.length, MAX_OWNER_SLOTS); i++) {
      const o = owners[i];
      const idx = i + 1;
      fields[`Nombre completo del Propietario ${idx}`] = o.fullName ?? "";
      fields[`Porcentaje del Propietario ${idx}`] =
        typeof o.ownership === "number" ? o.ownership : Number(o.ownership ?? 0);
      // Optional if you have these cols:
      fields[`Email del Propietario ${idx}`] = (o as any).email ?? "";
      fields[`Teléfono del Propietario ${idx}`] = (o as any).phone ?? "";
    }

    // Create Airtable record
    const res = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }] }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: text }, { status: 500 });
    }

    const json = (await res.json()) as AirtableCreateResponse;
    return NextResponse.json({ ok: true, recordId: json.records?.[0]?.id ?? "" });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}