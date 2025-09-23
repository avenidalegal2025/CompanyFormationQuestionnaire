// src/app/api/submit/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  company: z.object({
    entityType: z.string(),
    companyName: z.string(),
  }),
  // add other validations when ready
});

type AirtableField = string | number | undefined;
type AirtableFields = Record<string, AirtableField>;

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid data" }, { status: 400 });
    }

    const data = parsed.data;

    const fields: AirtableFields = {};

    if (data.company.entityType === "LLC") {
      fields["Nombre de la LLC"] = data.company.companyName;
      fields["Nombre de la C-Corp"] = "";
    } else if (data.company.entityType === "C-Corp") {
      fields["Nombre de la C-Corp"] = data.company.companyName;
      fields["Nombre de la LLC"] = "";
    } else {
      fields["Nombre de la LLC"] = data.company.companyName;
      fields["Nombre de la C-Corp"] = data.company.companyName;
    }

    fields["LLC o C-Corp"] =
      data.company.entityType === "C-Corp" ? "Corporation" : "LLC";

    // TODO: add the Airtable fetch here when ready.
    // For now just respond success so the build passes.
    return NextResponse.json({ ok: true, fields });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}