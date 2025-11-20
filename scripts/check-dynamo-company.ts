/**
 * Script to check DynamoDB for a company by name
 * Usage: ts-node scripts/check-dynamo-company.ts <company-name>
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

async function checkCompany(companyName: string) {
  console.log(`🔍 Searching for company: "${companyName}"`);
  console.log(`📋 Table: ${TABLE_NAME}`);
  console.log(`🌍 Region: ${REGION}\n`);

  try {
    // Scan the table for companies matching the name
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "contains(formData.company.companyName, :name)",
      ExpressionAttributeValues: {
        ":name": companyName,
      },
    });

    const response = await ddb.send(command);
    
    if (!response.Items || response.Items.length === 0) {
      console.log(`❌ No companies found matching "${companyName}"`);
      console.log(`\n💡 Trying case-insensitive search...\n`);
      
      // Try scanning all items and filtering manually
      const scanAll = new ScanCommand({
        TableName: TABLE_NAME,
      });
      
      const allItems = await ddb.send(scanAll);
      
      if (allItems.Items) {
        const matches = allItems.Items.filter(item => {
          const formData = item.formData;
          if (!formData || !formData.company) return false;
          const name = formData.company.companyName || '';
          return name.toLowerCase().includes(companyName.toLowerCase());
        });
        
        if (matches.length > 0) {
          console.log(`✅ Found ${matches.length} matching company(ies):\n`);
          matches.forEach((item, idx) => {
            console.log(`\n--- Company ${idx + 1} ---`);
            console.log(`PK: ${item.pk}`);
            console.log(`SK: ${item.sk}`);
            console.log(`Company Name: ${item.formData?.company?.companyName || 'N/A'}`);
            console.log(`Entity Type: ${item.formData?.company?.entityType || 'N/A'}`);
            console.log(`Formation State: ${item.formData?.company?.formationState || 'N/A'}`);
            console.log(`Has formData: ${!!item.formData}`);
            console.log(`Has company: ${!!item.formData?.company}`);
            console.log(`Has owners: ${!!item.formData?.owners}`);
            console.log(`Owners count: ${item.formData?.owners?.length || 0}`);
            console.log(`formDataUpdatedAt: ${item.formDataUpdatedAt || 'N/A'}`);
          });
        } else {
          console.log(`❌ No companies found even with case-insensitive search`);
          console.log(`\n📊 Total items in table: ${allItems.Items.length}`);
          console.log(`\n💡 Showing first 5 items with formData:\n`);
          
          const withFormData = allItems.Items.filter(item => item.formData).slice(0, 5);
          withFormData.forEach((item, idx) => {
            console.log(`\n--- Item ${idx + 1} ---`);
            console.log(`PK: ${item.pk}`);
            console.log(`SK: ${item.sk}`);
            console.log(`Company Name: ${item.formData?.company?.companyName || 'N/A'}`);
          });
        }
      }
    } else {
      console.log(`✅ Found ${response.Items.length} matching company(ies):\n`);
      response.Items.forEach((item, idx) => {
        console.log(`\n--- Company ${idx + 1} ---`);
        console.log(`PK: ${item.pk}`);
        console.log(`SK: ${item.sk}`);
        console.log(`Company Name: ${item.formData?.company?.companyName || 'N/A'}`);
        console.log(`Entity Type: ${item.formData?.company?.entityType || 'N/A'}`);
        console.log(`Formation State: ${item.formData?.company?.formationState || 'N/A'}`);
        console.log(`Has formData: ${!!item.formData}`);
        console.log(`Has company: ${!!item.formData?.company}`);
        console.log(`Has owners: ${!!item.formData?.owners}`);
        console.log(`Owners count: ${item.formData?.owners?.length || 0}`);
        console.log(`formDataUpdatedAt: ${item.formDataUpdatedAt || 'N/A'}`);
      });
    }
  } catch (error: any) {
    console.error('❌ Error checking DynamoDB:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Get company name from command line args
const companyName = process.argv[2] || 'Dunete';

checkCompany(companyName)
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

