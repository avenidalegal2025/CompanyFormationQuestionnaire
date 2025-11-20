/**
 * Script to list all companies in DynamoDB
 * Usage: ts-node scripts/list-dynamo-companies.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "us-west-1";
const TABLE_NAME = process.env.DYNAMO_TABLE || "Company_Creation_Questionaire_Avenida_Legal";

const ddbClient = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const ddb = DynamoDBDocumentClient.from(ddbClient);

async function listCompanies() {
  console.log(`📋 Listing all companies from DynamoDB`);
  console.log(`📋 Table: ${TABLE_NAME}`);
  console.log(`🌍 Region: ${REGION}\n`);

  try {
    // Scan the table for all items with formData
    const command = new ScanCommand({
      TableName: TABLE_NAME,
    });

    const response = await ddb.send(command);
    
    if (!response.Items || response.Items.length === 0) {
      console.log(`❌ No items found in table`);
      return;
    }

    console.log(`✅ Found ${response.Items.length} total items in table\n`);

    // Filter items that have formData with company name
    const companies = response.Items
      .filter(item => item.formData && item.formData.company && item.formData.company.companyName)
      .map(item => ({
        pk: item.pk,
        sk: item.sk,
        companyName: item.formData.company.companyName,
        entityType: item.formData.company.entityType,
        formationState: item.formData.company.formationState,
        formDataUpdatedAt: item.formDataUpdatedAt,
        createdAt: item.createdAt || item.formDataUpdatedAt,
        hasOwners: !!item.formData.owners && item.formData.owners.length > 0,
        ownersCount: item.formData.owners?.length || 0,
      }))
      .sort((a, b) => {
        // Sort by formDataUpdatedAt or createdAt, most recent first
        const dateA = new Date(a.formDataUpdatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.formDataUpdatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });

    if (companies.length === 0) {
      console.log(`❌ No companies found (items with formData.company.companyName)`);
      console.log(`\n📊 Showing all items (first 10):\n`);
      response.Items.slice(0, 10).forEach((item, idx) => {
        console.log(`\n--- Item ${idx + 1} ---`);
        console.log(`PK: ${item.pk}`);
        console.log(`SK: ${item.sk}`);
        console.log(`Has formData: ${!!item.formData}`);
        if (item.formData) {
          console.log(`Has company: ${!!item.formData.company}`);
          console.log(`Company name: ${item.formData.company?.companyName || 'N/A'}`);
        }
      });
      return;
    }

    console.log(`✅ Found ${companies.length} companies:\n`);
    console.log(`📅 Most recent companies (sorted by update date):\n`);
    
    companies.forEach((company, idx) => {
      console.log(`\n--- Company ${idx + 1} ---`);
      console.log(`Company Name: ${company.companyName}`);
      console.log(`Entity Type: ${company.entityType || 'N/A'}`);
      console.log(`Formation State: ${company.formationState || 'N/A'}`);
      console.log(`PK (User Email): ${company.pk}`);
      console.log(`SK: ${company.sk}`);
      console.log(`Owners Count: ${company.ownersCount}`);
      console.log(`Last Updated: ${company.formDataUpdatedAt || company.createdAt || 'N/A'}`);
    });

    console.log(`\n\n🔍 Most Recent Company:`);
    if (companies.length > 0) {
      const mostRecent = companies[0];
      console.log(`   Name: ${mostRecent.companyName}`);
      console.log(`   Type: ${mostRecent.entityType}`);
      console.log(`   State: ${mostRecent.formationState}`);
      console.log(`   User: ${mostRecent.pk}`);
      console.log(`   Updated: ${mostRecent.formDataUpdatedAt || mostRecent.createdAt}`);
    }

  } catch (error: any) {
    console.error('❌ Error listing companies:', error.message);
    if (error.message.includes('security token') || error.message.includes('credentials')) {
      console.error('\n💡 AWS credentials not configured. Please set:');
      console.error('   - AWS_ACCESS_KEY_ID');
      console.error('   - AWS_SECRET_ACCESS_KEY');
      console.error('   - AWS_REGION (optional, defaults to us-west-1)');
    }
    console.error('Stack:', error.stack);
  }
}

listCompanies()
  .then(() => {
    console.log('\n✅ List complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

