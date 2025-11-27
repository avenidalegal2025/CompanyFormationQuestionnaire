/**
 * Airtable Field Addition Script
 * 
 * This script adds new fields for persona/empresa toggle and nested owners
 * to the existing "Formations" table.
 * 
 * Prerequisites:
 *   1. Have an existing "Formations" table in your Airtable base
 *   2. Get your Base ID from the URL (starts with "app...")
 *   3. Create a Personal Access Token with these scopes:
 *      - schema.bases:read
 *      - schema.bases:write
 *   4. Set environment variables:
 *      AIRTABLE_API_KEY=patXXXXXXXXXXXXXXXX
 *      AIRTABLE_BASE_ID=appXXXXXXXXXXXXXXXX
 * 
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/add-airtable-fields.ts
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

// New field definitions for persona/empresa and nested owners
const newFields: any[] = [];

// For each owner (1-6), add:
// - Owner Type (persona/empresa)
// - Company Name (if empresa)
// - Company Address (if empresa)
// - Nested Owners Count
// - Nested Owner 1-6 fields (Name, Address, SSN, ID Document URL)
for (let ownerNum = 1; ownerNum <= 6; ownerNum++) {
  // Owner Type
  newFields.push({
    name: `Owner ${ownerNum} Type`,
    type: 'singleSelect',
    options: {
      choices: [
        { name: 'persona' },
        { name: 'empresa' }
      ]
    }
  });

  // Company fields (only used when Type = empresa)
  newFields.push({
    name: `Owner ${ownerNum} Company Name`,
    type: 'singleLineText'
  });

  newFields.push({
    name: `Owner ${ownerNum} Company Address`,
    type: 'multilineText'
  });

  newFields.push({
    name: `Owner ${ownerNum} Nested Owners Count`,
    type: 'number',
    options: { precision: 0 }
  });

  // Nested Owner fields (1-6)
  for (let nestedNum = 1; nestedNum <= 6; nestedNum++) {
    newFields.push({
      name: `Owner ${ownerNum} Nested Owner ${nestedNum} Name`,
      type: 'singleLineText'
    });

    newFields.push({
      name: `Owner ${ownerNum} Nested Owner ${nestedNum} Address`,
      type: 'multilineText'
    });

    newFields.push({
      name: `Owner ${ownerNum} Nested Owner ${nestedNum} SSN`,
      type: 'singleLineText'
    });

    newFields.push({
      name: `Owner ${ownerNum} Nested Owner ${nestedNum} ID Document URL`,
      type: 'url'
    });
  }
}

async function addFields() {
  console.log('🚀 Adding fields to Airtable Table\n');
  console.log('═'.repeat(50));
  console.log(`Base ID: ${AIRTABLE_BASE_ID}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`New Fields: ${newFields.length}`);
  console.log('═'.repeat(50) + '\n');

  try {
    // First, get the table ID
    console.log('📡 Fetching table information...\n');
    const tablesResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!tablesResponse.ok) {
      const errorText = await tablesResponse.text();
      console.error('❌ Failed to fetch tables');
      console.error(`Status: ${tablesResponse.status} ${tablesResponse.statusText}`);
      console.error(`Response: ${errorText}\n`);
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
    const fieldsToSkip = newFields.filter(f => existingFields.includes(f.name));

    if (fieldsToSkip.length > 0) {
      console.log(`⚠️  Skipping ${fieldsToSkip.length} fields that already exist:\n`);
      fieldsToSkip.forEach((f: any) => {
        console.log(`   - ${f.name}`);
      });
      console.log('');
    }

    if (fieldsToAdd.length === 0) {
      console.log('✅ All fields already exist! Nothing to add.\n');
      return;
    }

    console.log(`📝 Adding ${fieldsToAdd.length} new fields...\n`);

    // Add fields in batches (Airtable has limits on batch size)
    const BATCH_SIZE = 10;
    let addedCount = 0;

    for (let i = 0; i < fieldsToAdd.length; i += BATCH_SIZE) {
      const batch = fieldsToAdd.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(fieldsToAdd.length / BATCH_SIZE);

      console.log(`📦 Batch ${batchNum}/${totalBatches}: Adding ${batch.length} fields...`);

      const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${tableId}/fields`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: batch
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to add batch ${batchNum}`);
        console.error(`Status: ${response.status} ${response.statusText}`);
        console.error(`Response: ${errorText}\n`);
        
        if (response.status === 401) {
          console.error('💡 Authentication failed. Please check:');
          console.error('   1. Your AIRTABLE_API_KEY is correct');
          console.error('   2. Your token has these scopes:');
          console.error('      - schema.bases:read');
          console.error('      - schema.bases:write');
          console.error('   3. Your token has access to this base\n');
        }
        
        process.exit(1);
      }

      const result = await response.json();
      addedCount += result.fields.length;
      console.log(`   ✅ Added ${result.fields.length} fields`);
    }

    console.log(`\n✅ Successfully added ${addedCount} fields to "${TABLE_NAME}" table!\n`);
    console.log('📋 Summary:');
    console.log(`   - Owner Type fields: 6`);
    console.log(`   - Company Name fields: 6`);
    console.log(`   - Company Address fields: 6`);
    console.log(`   - Nested Owners Count fields: 6`);
    console.log(`   - Nested Owner Name fields: 36 (6 owners × 6 nested)`);
    console.log(`   - Nested Owner Address fields: 36`);
    console.log(`   - Nested Owner SSN fields: 36`);
    console.log(`   - Nested Owner ID Document URL fields: 36`);
    console.log(`   - Total: ${newFields.length} fields\n`);
    
  } catch (error: any) {
    console.error('❌ Error adding fields:', error.message);
    process.exit(1);
  }
}

await addFields();
})();

