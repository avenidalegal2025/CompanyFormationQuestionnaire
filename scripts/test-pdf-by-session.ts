/**
 * Test script for tax form PDF generation using Stripe session ID
 * Usage: ts-node scripts/test-pdf-by-session.ts <session-id>
 */

import { getFormDataSnapshot } from '../src/lib/s3-vault';
import { generateAllTaxForms } from '../src/lib/pdf-filler';
import { getVaultMetadata } from '../src/lib/dynamo';

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('❌ Usage: ts-node scripts/test-pdf-by-session.ts <session-id>');
  console.error('   Example: ts-node scripts/test-pdf-by-session.ts cs_test_abc123');
  process.exit(1);
}

async function testPDFGeneration() {
  console.log('🧪 Testing Tax Form PDF Generation\n');
  console.log(`🔑 Session ID: ${sessionId}\n`);

  // Step 1: Get form data from S3 snapshot (this contains all the info we need)
  console.log('📥 Loading form data from S3 snapshot...');
  const formData = await getFormDataSnapshot(sessionId);
  
  if (!formData) {
    console.error('❌ No form data snapshot found for this session');
    console.error('💡 This might mean:');
    console.error('   1. The form data snapshot was not saved during checkout');
    console.error('   2. The session ID is incorrect');
    console.error('   3. Check S3 bucket for: form-data/' + sessionId + '.json');
    process.exit(1);
  }
  
  console.log('✅ Loaded form data from S3 snapshot\n');

  // Extract user email and company name from form data
  const userId = process.argv[3] || formData.profile?.email || formData.company?.companyName || 'unknown';
  const companyName = formData.company?.companyName || 'Company';

  console.log(`📧 User Email: ${userId}`);
  console.log(`🏢 Company Name: ${companyName}\n`);

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
    console.error('❌ No vault found for user.');
    console.error('💡 Vault should be created during payment webhook.');
    console.error('💡 This might mean the webhook has not run yet or failed.');
    console.error(`💡 User email: ${userId}`);
    process.exit(1);
  }
  
  const vaultPath = vaultMetadata.vaultPath;
  const finalCompanyName = vaultMetadata.companyName || formData.company.companyName;
  
  console.log(`✅ Vault path: ${vaultPath}`);
  console.log(`✅ Company name: ${finalCompanyName}\n`);

  // Step 4: Generate PDFs
  console.log('📄 Starting PDF generation...\n');
  
  try {
    const taxForms = await generateAllTaxForms(
      vaultPath,
      finalCompanyName,
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
      console.log('💡 Common issues:');
      console.log('   - Lambda functions not responding');
      console.log('   - Invalid template URLs');
      console.log('   - Missing required form data fields');
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

