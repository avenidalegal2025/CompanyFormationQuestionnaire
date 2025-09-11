

import { NextRequest, NextResponse } from 'next/server'
import { AllStepsSchema } from '@/lib/schema'

/**
 * POST /api/submit
 * - Validates the multi-step questionnaire payload
 * - Writes a record to Airtable
 * - Splits owners into per-owner columns (Propietario 1/2/3/…)
 * - Also stores the full owners array as JSON for audit/flexibility
 *
 * IMPORTANT:
 *   Make sure these Airtable columns exist with EXACT names:
 *   - 'Nombre de la LLC' (Single line text)
 *   - 'Nombre de la C-Corp' (Single line text)
 *   - 'LLC o C-Corp' (Single select: 'LLC' | 'Corporation')
 *   - 'Estado de USA donde desea formar su empresa' (Single line text)
 *   - 'Dirección principal de la empresa' (Long text or Single line)
 *   - 'Business Purpose' (Long text)  // or rename below to your real field
 *   - 'EIN Needed' (Single select: 'Yes' | 'No') // or rename to your real field
 *   - 'Owners JSON' (Long text)
 *   - 'Need Bank Account' (Single select: 'Yes' | 'No')
 *   - 'Bank Preference' (Single line text)
 *   - 'ID Document URL' (Single line text)
 *   - 'Proof of Address URL' (Single line text)
 *   - Per-owner columns (create up to as many as you want supported):
 *       'Nombre completo del Propietario 1', 'Porcentaje del Propietario 1',
 *       'Email del Propietario 1', 'Teléfono del Propietario 1',
 *       ... (repeat for 2, 3, 4, …)
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 1) Validate payload shape
    const parsed = AllStepsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // 2) Env
    const apiKey = process.env.AIRTABLE_API_KEY
    const baseId = process.env.AIRTABLE_BASE_ID
    const tableName = process.env.AIRTABLE_TABLE_NAME

    if (!apiKey || !baseId || !tableName) {
      return NextResponse.json(
        { ok: false, error: 'Missing Airtable env vars' },
        { status: 500 }
      )
    }

    // 3) Build the fields object for Airtable
    const fields: Record<string, any> = {}

    // ===== Company name by entity type (es: Nombre de la LLC / Nombre de la C-Corp)
    if (body.company.entityType === 'LLC') {
      fields['Nombre de la LLC'] = body.company.companyName
      fields['Nombre de la C-Corp'] = '' // keep empty for clarity
    } else if (body.company.entityType === 'Corporation') {
      fields['Nombre de la C-Corp'] = body.company.companyName
      fields['Nombre de la LLC'] = ''
    } else {
      // For other entity types, write the generic name to both (Airtable will show it in whichever field exists)
      fields['Nombre de la LLC'] = body.company.companyName
      fields['Nombre de la C-Corp'] = body.company.companyName
    }

    // Entity type (Spanish header present in your CSV)
    fields['LLC o C-Corp'] = body.company.entityType

    // Formation state (Spanish header present in your CSV)
    fields['Estado de USA donde desea formar su empresa'] = body.company.formationState

    // Business purpose — adjust the key to your real Airtable field name if different
    fields['Business Purpose'] = body.company.businessPurpose

    // Address: concatenate parts into your single field 'Dirección principal de la empresa'
    const fullAddress = [
      body.company.addressLine1,
      body.company.addressLine2 || '',
      body.company.city || '',
      body.company.state || '',
      body.company.postalCode || '',
      body.company.country || '',
    ].filter(Boolean).join(', ')
    fields['Dirección principal de la empresa'] = fullAddress

    // EIN needed — adjust the key if your field is named differently (e.g., '¿Necesita EIN?')
    fields['EIN Needed'] = body.company.einNeeded

    // ===== Owners (split into Propietario 1/2/3… AND keep JSON)
    fields['Owners JSON'] = JSON.stringify(body.owners)

    // How many owners columns do you want to support?
    // Change this number to the maximum you have created in Airtable.
    const MAX_OWNER_SLOTS = 10

    for (let i = 0; i < Math.min(body.owners.length, MAX_OWNER_SLOTS); i++) {
      const owner = body.owners[i]
      const idx = i + 1 // 1-based

      // Required/safe fields (names & percentages)
      fields[`Nombre completo del Propietario ${idx}`] = owner.fullName || ''
      // Convert number to a plain number for Airtable (Single line text or Number field)
      fields[`Porcentaje del Propietario ${idx}`] = typeof owner.ownership === 'number'
        ? owner.ownership
        : (owner.ownership ? Number(owner.ownership) : 0)

      // Optional fields — only populate if you created these columns in Airtable
      fields[`Email del Propietario ${idx}`] = owner.email || ''
      fields[`Teléfono del Propietario ${idx}`] = owner.phone || ''
    }

    // If there are more owner columns than provided owners, you may want to clear them.
    // (Optional) Example to clear up to MAX_OWNER_SLOTS:
    // for (let i = body.owners.length; i < MAX_OWNER_SLOTS; i++) {
    //   const idx = i + 1
    //   fields[`Nombre completo del Propietario ${idx}`] = ''
    //   fields[`Porcentaje del Propietario ${idx}`] = ''
    //   fields[`Email del Propietario ${idx}`] = ''
    //   fields[`Teléfono del Propietario ${idx}`] = ''
    // }

    // ===== Banking
    fields['Need Bank Account'] = body.banking.needBankAccount
    fields['Bank Preference'] = body.banking.bankPreference ?? ''

    // ===== Attachments (URLs as text)
    fields['ID Document URL'] = body.attachments.idDocumentUrl ?? ''
    fields['Proof of Address URL'] = body.attachments.proofOfAddressUrl ?? ''

    // 4) Create the Airtable record
    const res = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{ fields }],
        }),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ ok: false, error: text }, { status: 500 })
    }

    const json = await res.json()
    return NextResponse.json({ ok: true, recordId: json.records?.[0]?.id })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}