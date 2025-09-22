import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  company: z.object({
    entityType: z.string(),
    companyName: z.string(),
  }),
  // ... other validations
});

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid data" }, { status: 400 });
    }

    const data = parsed.data;

    type AirtableField = string | number | undefined;
    const fields: Record<string, AirtableField> = {};

    if (data.company.entityType === 'LLC') {
      fields['Nombre de la LLC'] = data.company.companyName;
      fields['Nombre de la C-Corp'] = '';
    } else if (data.company.entityType === 'C-Corp') {
      fields['Nombre de la C-Corp'] = data.company.companyName;
      fields['Nombre de la LLC'] = '';
    } else {
      fields['Nombre de la LLC'] = data.company.companyName;
      fields['Nombre de la C-Corp'] = data.company.companyName;
    }

    fields['LLC o C-Corp'] = data.company.entityType === 'C-Corp' ? 'Corporation' : 'LLC';

    // ... rest of the code using data instead of body

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}