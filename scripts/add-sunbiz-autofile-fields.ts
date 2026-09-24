/**
 * Airtable Field Addition Script — Sunbiz auto-file hardening
 *
 * Adds the fields the hardened filing pipeline relies on:
 *   - "Virtual Office Used" (singleSelect Yes/No) — app writes Yes when the
 *     Avenida virtual-office address was substituted for a client with no US
 *     address (src/lib/airtable.ts mapQuestionnaireToAirtable).
 *   - "Autofill Attempts" (number) — watcher failure counter (autofill_watcher.py).
 *   - Ensures the "Needs Review" choice exists on "Formation Status" — the
 *     fail-visible gates (flag_needs_review) and the watcher set this status.
 *
 * Prerequisites and usage are identical to add-airtable-fields.ts:
 *   AIRTABLE_API_KEY=patXXX (needs schema.bases:read + schema.bases:write)
 *   AIRTABLE_BASE_ID=appXXX
 *   npx ts-node --project tsconfig.scripts.json scripts/add-sunbiz-autofile-fields.ts
 */

// Wrap in IIFE to avoid variable redeclaration conflicts
(async () => {
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('❌ Missing environment variables:');
  console.error('   AIRTABLE_API_KEY:', AIRTABLE_API_KEY ? '✅ Set' : '❌ Missing');
  console.error('   AIRTABLE_BASE_ID:', AIRTABLE_BASE_ID ? '✅ Set' : '❌ Missing');
  console.error('\nPlease set these variables and try again.');
  process.exit(1);
}

const newFields: any[] = [
  {
    name: 'Virtual Office Used',
    type: 'singleSelect',
    options: {
      choices: [
        { name: 'Yes' },
        { name: 'No' },
      ],
    },
  },
  {
    name: 'Autofill Attempts',
    type: 'number',
    options: { precision: 0 },
  },
];

const headers = {
  'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
};

async function addFields() {
  console.log('🚀 Adding Sunbiz auto-file fields to Airtable\n');
  console.log('═'.repeat(50));
  console.log(`Base ID: ${AIRTABLE_BASE_ID}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log('═'.repeat(50) + '\n');

  // First, get the table ID
  console.log('📡 Fetching table information...\n');
  const tablesResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    method: 'GET',
    headers,
  });

  if (!tablesResponse.ok) {
    const errorText = await tablesResponse.text();
    console.error('❌ Failed to fetch tables');
    console.error(`Status: ${tablesResponse.status} ${tablesResponse.statusText}`);
    console.error(`Response: ${errorText}\n`);
    if (tablesResponse.status === 401 || tablesResponse.status === 403) {
      console.error('💡 Token needs schema.bases:read + schema.bases:write scopes.');
      console.error('   Create these fields manually in the Airtable UI if the token is data-only.\n');
    }
    process.exit(1);
  }

  const tablesData = await tablesResponse.json();
  const table = tablesData.tables.find((t: any) => t.name === TABLE_NAME);

  if (!table) {
    console.error(`❌ Table "${TABLE_NAME}" not found in base`);
    console.error('Available tables:', tablesData.tables.map((t: any) => t.name).join(', '));
    process.exit(1);
  }

  const tableId = table.id;
  console.log(`✅ Found table: ${TABLE_NAME} (ID: ${tableId})\n`);

  // Check existing fields to avoid duplicates
  const existingFields = table.fields.map((f: any) => f.name);
  const fieldsToAdd = newFields.filter(f => !existingFields.includes(f.name));

  if (fieldsToAdd.length === 0) {
    console.log('✅ All fields already exist! Nothing to add.\n');
  } else {
    console.log(`📝 Adding ${fieldsToAdd.length} new field(s)...\n`);
    for (const field of fieldsToAdd) {
      const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${tableId}/fields`, {
        method: 'POST',
        headers,
        body: JSON.stringify(field),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to add field "${field.name}"`);
        console.error(`Status: ${response.status} ${response.statusText}`);
        console.error(`Response: ${errorText}\n`);
        process.exit(1);
      }
      console.log(`   ✅ Added: ${field.name}`);
    }
  }

  // Ensure the "Needs Review" choice exists on "Formation Status"
  const statusField = table.fields.find((f: any) => f.name === 'Formation Status');
  if (!statusField) {
    console.error('❌ "Formation Status" field not found — cannot verify "Needs Review" choice');
    process.exit(1);
  }
  if (statusField.type !== 'singleSelect') {
    console.log(`ℹ️  "Formation Status" is type "${statusField.type}" (not singleSelect) — no choice to add.\n`);
  } else {
    const choices = statusField.options?.choices?.map((c: any) => c.name) || [];
    if (choices.includes('Needs Review')) {
      console.log('✅ "Needs Review" choice already exists on "Formation Status".\n');
    } else {
      console.log('📝 Adding "Needs Review" choice to "Formation Status"...\n');
      const response = await fetch(
        `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${tableId}/fields/${statusField.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            options: {
              choices: [...statusField.options.choices, { name: 'Needs Review', color: 'redBright' }],
            },
          }),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        // Non-fatal: Airtable's meta API rejects select-option updates on some
        // bases ("Changing a field's type ... is not currently supported").
        // The choice must then be added by hand — one click in the UI.
        console.warn('⚠️  Could not add "Needs Review" choice via API:');
        console.warn(`   Status: ${response.status} ${response.statusText} — ${errorText}`);
        console.warn('   ➜ Add it manually: Airtable UI → Formations → "Formation Status"');
        console.warn('     field → Edit field → add option "Needs Review". Until then,');
        console.warn('     fail-visible gates (flag_needs_review) will 422 when they write.\n');
        return;
      }
      console.log('   ✅ Added "Needs Review" choice.\n');
    }
  }

  console.log('✅ Done. Fields ready for the Sunbiz auto-file pipeline.\n');
}

await addFields();
})();
