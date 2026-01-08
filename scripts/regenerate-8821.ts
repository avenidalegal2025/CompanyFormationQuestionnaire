/**
 * Script to regenerate Form 8821 PDF for an existing company
 * Usage: ts-node --project tsconfig.scripts.json scripts/regenerate-8821.ts <company-name-or-email>
 */

import { generate8821PDF } from '../src/lib/pdf-filler';
import { getFormData } from '../src/lib/dynamo';
import Airtable from 'airtable';
import { getVaultMetadata } from '../src/lib/dynamo';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('❌ Airtable credentials not configured');
  process.exit(1);
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

async function findCompany(searchTerm: string) {
  console.log(`🔍 Searching for company: "${searchTerm}"...`);
  
  // Try to find by company name first
  const records: any[] = [];
  await base(AIRTABLE_TABLE_NAME)
    .select({
      filterByFormula: `SEARCH("${searchTerm}", LOWER({Company Name})) > 0`,
      maxRecords: 10,
    })
    .eachPage((pageRecords, fetchNextPage) => {
      pageRecords.forEach(record => records.push(record));
      fetchNextPage();
    });
  
  // If not found by name, try by email
  if (records.length === 0 && searchTerm.includes('@')) {
    console.log(`   Trying email search...`);
    await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `LOWER({Customer Email}) = "${searchTerm.toLowerCase()}"`,
        maxRecords: 10,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach(record => records.push(record));
        fetchNextPage();
      });
  }
  
  return records;
}

async function regenerate8821() {
  const searchTerm = process.argv[2];
  
  if (!searchTerm) {
    console.error('❌ Usage: ts-node scripts/regenerate-8821.ts <company-name-or-email>');
    console.error('   Example: ts-node scripts/regenerate-8821.ts Oceanis');
    console.error('   Example: ts-node scripts/regenerate-8821.ts customer@example.com');
    process.exit(1);
  }
  
  try {
    // Step 1: Find company in Airtable
    const records = await findCompany(searchTerm);
    
    if (records.length === 0) {
      console.error(`❌ No company found matching "${searchTerm}"`);
      process.exit(1);
    }
    
    if (records.length > 1) {
      console.log(`⚠️  Found ${records.length} companies. Using the first one:`);
      records.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.fields['Company Name']} (${r.fields['Customer Email']})`);
      });
    }
    
    const record = records[0];
    const companyName = record.fields['Company Name'] as string;
    const customerEmail = record.fields['Customer Email'] as string;
    const vaultPath = record.fields['Vault Path'] as string;
    
    console.log(`\n✅ Found company: ${companyName}`);
    console.log(`   Email: ${customerEmail}`);
    console.log(`   Vault Path: ${vaultPath || 'NOT SET'}`);
    
    // Step 2: Get form data from DynamoDB
    console.log(`\n📥 Retrieving form data from DynamoDB...`);
    const formData = await getFormData(customerEmail);
    
    if (!formData) {
      console.error(`❌ No form data found for email: ${customerEmail}`);
      console.error(`   The form data might be stored under a different key.`);
      console.error(`   Try checking the Stripe session ID or user ID.`);
      process.exit(1);
    }
    
    console.log(`✅ Form data retrieved`);
    console.log(`   Entity Type: ${formData.company?.entityType || 'NOT SET'}`);
    console.log(`   Owners: ${formData.owners?.length || 0}`);
    
    // Step 3: Get or determine vault path
    let finalVaultPath = vaultPath;
    if (!finalVaultPath) {
      console.log(`\n📁 Vault path not in Airtable, checking DynamoDB...`);
      const vaultMetadata = await getVaultMetadata(customerEmail);
      if (vaultMetadata) {
        finalVaultPath = vaultMetadata.vaultPath;
        console.log(`   Found in DynamoDB: ${finalVaultPath}`);
      } else {
        // Generate a vault path from company name
        finalVaultPath = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);
        console.log(`   Generated new vault path: ${finalVaultPath}`);
      }
    }
    
    // Step 4: Generate 8821 PDF
    console.log(`\n📄 Generating Form 8821 PDF...`);
    const result = await generate8821PDF(finalVaultPath, companyName, formData);
    
    if (result.success) {
      console.log(`\n✅ Form 8821 PDF generated successfully!`);
      console.log(`   File: ${result.fileName}`);
      console.log(`   S3 Key: ${result.s3Key}`);
      console.log(`   Size: ${(result.size || 0) / 1024} KB`);
      console.log(`\n📋 S3 URL: s3://avenida-legal-documents/${result.s3Key}`);
    } else {
      console.error(`\n❌ Failed to generate Form 8821 PDF:`);
      console.error(`   Error: ${result.error}`);
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

regenerate8821();

