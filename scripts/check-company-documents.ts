/**
 * Check if documents were created for a company
 * Usage: ts-node scripts/check-company-documents.ts <user-email>
 */

import { getUserDocuments, getVaultMetadata } from '../src/lib/dynamo';

const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Usage: ts-node scripts/check-company-documents.ts <user-email>');
  process.exit(1);
}

async function checkDocuments() {
  console.log(`\n🔍 Checking documents for: ${userEmail}\n`);
  
  try {
    // Get vault metadata
    const vaultMetadata = await getVaultMetadata(userEmail);
    if (!vaultMetadata) {
      console.log('❌ No vault found for this user');
      return;
    }
    
    console.log('📁 Vault Info:');
    console.log(`   Path: ${vaultMetadata.vaultPath}`);
    console.log(`   Company: ${vaultMetadata.companyName}`);
    console.log('');
    
    // Get documents
    const documents = await getUserDocuments(userEmail);
    
    console.log(`📄 Documents (${documents.length} total):`);
    documents.forEach((doc, index) => {
      console.log(`\n   ${index + 1}. ${doc.name || doc.id}`);
      console.log(`      Type: ${doc.type || 'N/A'}`);
      console.log(`      Status: ${doc.status || 'N/A'}`);
      console.log(`      S3 Key: ${doc.s3Key || 'N/A'}`);
      if (doc.signedS3Key) {
        console.log(`      Signed S3 Key: ${doc.signedS3Key}`);
      }
    });
    
    // Check for tax forms specifically
    const taxForms = documents.filter(d => d.type === 'tax');
    console.log(`\n📊 Tax Forms: ${taxForms.length}/3`);
    const expected = ['ss4-ein-application', 'form-2848-power-of-attorney', 'form-8821-tax-authorization'];
    expected.forEach(id => {
      const found = taxForms.find(d => d.id === id);
      if (found) {
        console.log(`   ✅ ${id}: ${found.status} - ${found.s3Key}`);
      } else {
        console.log(`   ❌ ${id}: NOT FOUND`);
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

checkDocuments()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
