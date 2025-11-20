/**
 * Test script for tax form PDF generation
 * Usage: ts-node scripts/test-pdf-generation.ts <user-email> [session-id]
 * 
 * If session-id is provided, it will use that session's form data
 * Otherwise, it will try to get form data from DynamoDB for the user
 */

import { getFormData } from '@/lib/dynamo';
import { getFormDataSnapshot } from '@/lib/s3-vault';
import { generateAllTaxForms } from '@/lib/pdf-filler';
import { getVaultMetadata } from '@/lib/dynamo';

const userId = process.argv[2];
const sessionId = process.argv[3];

if (!userId) {
  console.error('❌ Usage: ts-node scripts/test-pdf-generation.ts <user-email> [session-id]');
  console.error('   Example: ts-node scripts/test-pdf-generation.ts user@example.com');
  console.error('   Example: ts-node scripts/test-pdf-generation.ts user@example.com cs_test_abc123');
  process.exit(1);
}

async function testPDFGeneration() {
  console.log('🧪 Testing Tax Form PDF Generation\n');
  console.log(`📧 User Email: ${userId}`);
  if (sessionId) {
    console.log(`🔑 Session ID: ${sessionId}\n`);
  }

  // Step 1: Get form data
  let formData: any = null;
  
  if (sessionId) {
    console.log('📥 Attempting to load form data from S3 snapshot...');
    formData = await getFormDataSnapshot(sessionId);
    if (formData) {
      console.log('✅ Loaded form data from S3 snapshot\n');
    } else {
      console.log('⚠️ No S3 snapshot found, trying DynamoDB...\n');
    }
  }
  
  if (!formData) {
    console.log('📥 Attempting to load form data from DynamoDB...');
    formData = await getFormData(userId);
    if (formData) {
      console.log('✅ Loaded form data from DynamoDB\n');
    } else {
      console.error('❌ No form data found in DynamoDB');
      console.error('💡 Try providing a session-id to use S3 snapshot instead');
      process.exit(1);
    }
  }

  // Step 2: Validate form data
  console.log('📋 FormData structure:');
  console.log({
    hasCompany: !!formData.company,
    companyName: formData.company?.companyName || 'N/A',
    entityType: formData.company?.entityType || 'N/A',
    hasOwners: !!formData.owners,
    ownersCount: formData.owners?.length || 0,
    hasAdmin: !!formData.admin,
    hasAgreement: !!formData.agreement,
  });
  console.log('');

  if (!formData.company?.companyName) {
    console.error('❌ Missing company name in form data');
    process.exit(1);
  }

  // Step 3: Get vault path
  console.log('📁 Getting vault metadata...');
  const vaultMetadata = await getVaultMetadata(userId);
  if (!vaultMetadata?.vaultPath) {
    console.error('❌ No vault found for user. Vault should be created during payment.');
    console.error('💡 You may need to create a company first, or provide a session-id from a completed payment');
    process.exit(1);
  }
  
  const vaultPath = vaultMetadata.vaultPath;
  const companyName = vaultMetadata.companyName || formData.company.companyName;
  
  console.log(`✅ Vault path: ${vaultPath}`);
  console.log(`✅ Company name: ${companyName}\n`);

  // Step 4: Generate PDFs
  console.log('📄 Starting PDF generation...\n');
  
  try {
    const taxForms = await generateAllTaxForms(
      vaultPath,
      companyName,
      formData
    );

    console.log('\n📊 Generation Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // SS-4
    if (taxForms.ss4.success) {
      console.log('✅ SS-4: SUCCESS');
      console.log(`   S3 Key: ${taxForms.ss4.s3Key}`);
      console.log(`   File: ${taxForms.ss4.fileName}`);
      console.log(`   Size: ${taxForms.ss4.size} bytes`);
    } else {
      console.log('❌ SS-4: FAILED');
      console.log(`   Error: ${taxForms.ss4.error}`);
    }
    
    console.log('');
    
    // Form 2848
    if (taxForms.form2848.success) {
      console.log('✅ Form 2848: SUCCESS');
      console.log(`   S3 Key: ${taxForms.form2848.s3Key}`);
      console.log(`   File: ${taxForms.form2848.fileName}`);
      console.log(`   Size: ${taxForms.form2848.size} bytes`);
    } else {
      console.log('❌ Form 2848: FAILED');
      console.log(`   Error: ${taxForms.form2848.error}`);
    }
    
    console.log('');
    
    // Form 8821
    if (taxForms.form8821.success) {
      console.log('✅ Form 8821: SUCCESS');
      console.log(`   S3 Key: ${taxForms.form8821.s3Key}`);
      console.log(`   File: ${taxForms.form8821.fileName}`);
      console.log(`   Size: ${taxForms.form8821.size} bytes`);
    } else {
      console.log('❌ Form 8821: FAILED');
      console.log(`   Error: ${taxForms.form8821.error}`);
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const successCount = [taxForms.ss4, taxForms.form2848, taxForms.form8821].filter(r => r.success).length;
    console.log(`\n📈 Summary: ${successCount}/3 PDFs generated successfully\n`);
    
    if (successCount === 3) {
      console.log('✅ All PDFs generated successfully!');
      console.log('💡 Check S3 bucket for the files:');
      if (taxForms.ss4.s3Key) console.log(`   - ${taxForms.ss4.s3Key}`);
      if (taxForms.form2848.s3Key) console.log(`   - ${taxForms.form2848.s3Key}`);
      if (taxForms.form8821.s3Key) console.log(`   - ${taxForms.form8821.s3Key}`);
    } else {
      console.log('⚠️ Some PDFs failed to generate. Check the errors above.');
    }
    
  } catch (error: any) {
    console.error('\n❌ Fatal error during PDF generation:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPDFGeneration()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

