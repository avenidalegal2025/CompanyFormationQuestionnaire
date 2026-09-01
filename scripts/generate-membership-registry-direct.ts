#!/usr/bin/env node
/**
 * Generate Membership Registry by calling the API endpoint directly
 * This works because the API has access to Vercel environment variables
 * 
 * Usage:
 *   node scripts/generate-membership-registry-direct.ts [recordId]
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 
                 (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://company-formation-questionnaire.vercel.app');

async function generateMembershipRegistry(recordId: string | undefined) {
  if (!recordId) {
    console.log('🔍 No recordId provided. Searching for an LLC record...');
    console.log('   (You can provide a recordId as the first argument)');
    console.log('   Example: node scripts/generate-membership-registry-direct.ts recXXXXXXXXXXXXXX\n');
    
    // Try to find a record by calling the companies API
    try {
      const companiesResponse = await fetch(`${BASE_URL}/api/companies?limit=10`);
      if (companiesResponse.ok) {
        const data = await companiesResponse.json();
        const llcCompanies = (data.companies || []).filter((c: { entityType?: string }) => c.entityType === 'LLC');
        if (llcCompanies.length > 0) {
          recordId = llcCompanies[0].id;
          console.log(`✅ Found LLC company: ${llcCompanies[0].companyName}`);
          console.log(`📋 Using recordId: ${recordId}\n`);
        } else {
          console.error('❌ No LLC companies found');
          process.exit(1);
        }
      }
    } catch (error: any) {
      console.error('❌ Error searching for companies:', error.message);
      console.error('   Please provide a recordId manually');
      process.exit(1);
    }
  }

  console.log(`📄 Generating Membership Registry for record: ${recordId}`);
  console.log(`🔗 Calling: ${BASE_URL}/api/airtable/generate-membership-registry\n`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/airtable/generate-membership-registry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      'x-internal-key': process.env.INTERNAL_API_KEY || '',
      },
      body: JSON.stringify({
        recordId: recordId,
        updateAirtable: true,
      }),
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}\n`);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Membership Registry generated successfully!');
      console.log(`📁 S3 Key: ${result.s3Key}`);
      console.log(`📊 Size: ${result.docxSize || 'N/A'} bytes`);
      if (result.viewUrl) {
        console.log(`🔗 View URL: ${result.viewUrl}`);
      }
      if (result.airtableUpdated) {
        console.log(`✅ Airtable record updated with Membership Registry URL`);
      }
      console.log('\n✅ Done!');
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to generate Membership Registry: ${response.status}`);
      console.error(`❌ Error: ${errorText}`);
      try {
        const errorJson = JSON.parse(errorText);
        console.error(`❌ Error details:`, JSON.stringify(errorJson, null, 2));
      } catch {
        // Not JSON, already printed as text
      }
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ Error calling API:`, error.message);
    console.error(`❌ Stack:`, error.stack);
    process.exit(1);
  }
}

const recordIdArg = process.argv[2];
generateMembershipRegistry(recordIdArg).catch((error: any) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
