#!/usr/bin/env npx ts-node
/**
 * Script to add First Name / Last Name fields to Airtable Formations table
 * 
 * Run with: npx ts-node scripts/add-airtable-name-fields.ts
 */

import Airtable from 'airtable';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('❌ Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables');
  console.log('\nSet them with:');
  console.log('  export AIRTABLE_API_KEY=patXXXXXXXXXXXXXXXX');
  console.log('  export AIRTABLE_BASE_ID=appXXXXXXXXXXXXXXXX');
  process.exit(1);
}

// Fields to add - all the firstName/lastName fields we need
const FIELDS_TO_ADD = [
  // Owners (1-6)
  ...Array.from({ length: 6 }, (_, i) => [`Owner ${i + 1} First Name`, `Owner ${i + 1} Last Name`]).flat(),
  
  // Nested Owners (Owner 1-6, Nested Owner 1-6)
  ...Array.from({ length: 6 }, (_, ownerIdx) => 
    Array.from({ length: 6 }, (_, nestedIdx) => [
      `Owner ${ownerIdx + 1} Nested Owner ${nestedIdx + 1} First Name`,
      `Owner ${ownerIdx + 1} Nested Owner ${nestedIdx + 1} Last Name`
    ]).flat()
  ).flat(),
  
  // Directors (1-6)
  ...Array.from({ length: 6 }, (_, i) => [`Director ${i + 1} First Name`, `Director ${i + 1} Last Name`]).flat(),
  
  // Officers (1-6)
  ...Array.from({ length: 6 }, (_, i) => [`Officer ${i + 1} First Name`, `Officer ${i + 1} Last Name`]).flat(),
  
  // Managers (1-6)
  ...Array.from({ length: 6 }, (_, i) => [`Manager ${i + 1} First Name`, `Manager ${i + 1} Last Name`]).flat(),
];

async function addFieldsToAirtable() {
  console.log('🔧 Adding First Name / Last Name fields to Airtable...\n');
  console.log(`📊 Total fields to add: ${FIELDS_TO_ADD.length}\n`);
  
  // Airtable doesn't have a direct API to add fields to a table schema
  // Instead, we'll create a test record with all fields, which will auto-create them
  // Then delete the test record
  
  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);
  const table = base('Formations');
  
  // Create a record with all the new fields (empty values)
  const fieldsObject: Record<string, string> = {};
  
  // Required fields for a valid record
  fieldsObject['Company Name'] = '__TEST_RECORD_DELETE_ME__';
  fieldsObject['Entity Type'] = 'LLC';
  fieldsObject['Formation State'] = 'Test';
  fieldsObject['Formation Status'] = 'Pending';
  fieldsObject['Customer Email'] = 'test@test.com';
  fieldsObject['Customer Name'] = 'Test User';
  fieldsObject['Total Payment Amount'] = '0';
  fieldsObject['Products Purchased'] = 'Test';
  fieldsObject['Payment Date'] = new Date().toISOString().split('T')[0];
  fieldsObject['Stripe Payment ID'] = '__TEST__';
  
  // Add all the new firstName/lastName fields with empty values
  FIELDS_TO_ADD.forEach(field => {
    fieldsObject[field] = '';
  });
  
  try {
    console.log('📝 Creating test record to auto-create fields...');
    
    const records = await table.create([{ fields: fieldsObject }], { typecast: true });
    const recordId = records[0].id;
    
    console.log(`✅ Test record created: ${recordId}`);
    console.log('🗑️ Deleting test record...');
    
    await table.destroy([recordId]);
    
    console.log('✅ Test record deleted');
    console.log('\n🎉 All fields have been added to Airtable!');
    console.log('\n📋 Fields added:');
    
    // Group fields for display
    console.log('\n  Owners:');
    for (let i = 1; i <= 6; i++) {
      console.log(`    - Owner ${i} First Name, Owner ${i} Last Name`);
    }
    
    console.log('\n  Nested Owners (72 fields):');
    console.log('    - Owner X Nested Owner Y First Name / Last Name');
    
    console.log('\n  Directors:');
    for (let i = 1; i <= 6; i++) {
      console.log(`    - Director ${i} First Name, Director ${i} Last Name`);
    }
    
    console.log('\n  Officers:');
    for (let i = 1; i <= 6; i++) {
      console.log(`    - Officer ${i} First Name, Officer ${i} Last Name`);
    }
    
    console.log('\n  Managers:');
    for (let i = 1; i <= 6; i++) {
      console.log(`    - Manager ${i} First Name, Manager ${i} Last Name`);
    }
    
  } catch (error: any) {
    console.error('❌ Failed to add fields:', error.message);
    
    if (error.message.includes('UNKNOWN_FIELD_NAME')) {
      console.log('\n💡 Airtable requires fields to be created manually in the UI.');
      console.log('   Go to your Airtable base and add these text fields:\n');
      FIELDS_TO_ADD.slice(0, 20).forEach(field => console.log(`   - ${field}`));
      console.log('   ... and more (see full list above)');
    }
    
    process.exit(1);
  }
}

addFieldsToAirtable();

