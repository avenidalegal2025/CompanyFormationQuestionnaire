#!/usr/bin/env node
/**
 * Script to add First Name / Last Name fields to Airtable Formations table
 * Uses Airtable Metadata API
 * 
 * Usage:
 *   AIRTABLE_API_KEY=patXXX AIRTABLE_BASE_ID=appXXX node scripts/create-airtable-fields.js
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('❌ Missing environment variables!');
  console.log('\nUsage:');
  console.log('  AIRTABLE_API_KEY=patXXX AIRTABLE_BASE_ID=appXXX node scripts/create-airtable-fields.js');
  console.log('\nGet your API key from: https://airtable.com/create/tokens');
  console.log('Get your Base ID from the Airtable URL: https://airtable.com/appXXXXXXXXXXXXXX/...');
  process.exit(1);
}

// All the firstName/lastName fields we need to create
const FIELDS_TO_ADD = [];

// Owners (1-6)
for (let i = 1; i <= 6; i++) {
  FIELDS_TO_ADD.push(`Owner ${i} First Name`);
  FIELDS_TO_ADD.push(`Owner ${i} Last Name`);
}

// Nested Owners (Owner 1-6, Nested Owner 1-6) = 72 fields
for (let ownerIdx = 1; ownerIdx <= 6; ownerIdx++) {
  for (let nestedIdx = 1; nestedIdx <= 6; nestedIdx++) {
    FIELDS_TO_ADD.push(`Owner ${ownerIdx} Nested Owner ${nestedIdx} First Name`);
    FIELDS_TO_ADD.push(`Owner ${ownerIdx} Nested Owner ${nestedIdx} Last Name`);
  }
}

// Directors (1-6)
for (let i = 1; i <= 6; i++) {
  FIELDS_TO_ADD.push(`Director ${i} First Name`);
  FIELDS_TO_ADD.push(`Director ${i} Last Name`);
}

// Officers (1-6)
for (let i = 1; i <= 6; i++) {
  FIELDS_TO_ADD.push(`Officer ${i} First Name`);
  FIELDS_TO_ADD.push(`Officer ${i} Last Name`);
}

// Managers (1-6)
for (let i = 1; i <= 6; i++) {
  FIELDS_TO_ADD.push(`Manager ${i} First Name`);
  FIELDS_TO_ADD.push(`Manager ${i} Last Name`);
}

console.log(`\n🔧 Adding ${FIELDS_TO_ADD.length} First Name / Last Name fields to Airtable...\n`);

async function getTableId() {
  const response = await fetch(
    `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
    {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get tables: ${error}`);
  }
  
  const data = await response.json();
  const table = data.tables.find(t => t.name === TABLE_NAME);
  
  if (!table) {
    throw new Error(`Table "${TABLE_NAME}" not found. Available tables: ${data.tables.map(t => t.name).join(', ')}`);
  }
  
  return table.id;
}

async function createField(tableId, fieldName) {
  const response = await fetch(
    `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${tableId}/fields`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: fieldName,
        type: 'singleLineText',
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    if (error.error?.type === 'DUPLICATE_FIELD_NAME') {
      return { skipped: true, name: fieldName };
    }
    throw new Error(`Failed to create field "${fieldName}": ${JSON.stringify(error)}`);
  }
  
  return { created: true, name: fieldName };
}

async function main() {
  try {
    // Get table ID
    console.log('📋 Getting table ID...');
    const tableId = await getTableId();
    console.log(`✅ Found table: ${TABLE_NAME} (${tableId})\n`);
    
    // Create fields
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const fieldName of FIELDS_TO_ADD) {
      try {
        const result = await createField(tableId, fieldName);
        if (result.created) {
          console.log(`  ✅ Created: ${fieldName}`);
          created++;
        } else if (result.skipped) {
          console.log(`  ⏭️  Skipped (exists): ${fieldName}`);
          skipped++;
        }
        
        // Rate limiting - Airtable allows 5 requests per second
        await new Promise(resolve => setTimeout(resolve, 250));
        
      } catch (err) {
        console.log(`  ❌ Failed: ${fieldName} - ${err.message}`);
        failed++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📋 Total: ${FIELDS_TO_ADD.length}\n`);
    
    if (created > 0) {
      console.log('🎉 Fields added successfully! You can now sync data to Airtable.\n');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('AUTHENTICATION_REQUIRED') || error.message.includes('401')) {
      console.log('\n💡 Your API key might not have the right permissions.');
      console.log('   Make sure your token has these scopes:');
      console.log('   - data.records:read');
      console.log('   - data.records:write');
      console.log('   - schema.bases:read');
      console.log('   - schema.bases:write  <-- Required for creating fields');
    }
    
    process.exit(1);
  }
}

main();

