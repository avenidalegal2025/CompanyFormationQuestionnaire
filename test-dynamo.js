#!/usr/bin/env node

/**
 * Test script to verify DynamoDB connection and domain storage
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

// Test DynamoDB connection
async function testDynamoDB() {
  console.log('🧪 Testing DynamoDB connection...\n');
  
  try {
    const ddbClient = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-west-1",
    });

    const ddb = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });

    const TABLE_NAME = process.env.DYNAMO_TABLE || "Company_Creation_Questionaire_Avenida_Legal";
    const TABLE_PK_NAME = process.env.DYNAMO_PK_NAME || 'id';
    const TABLE_SK_NAME = process.env.DYNAMO_SK_NAME;
    const TABLE_SK_VALUE = process.env.DYNAMO_SK_VALUE || 'DOMAINS';

    console.log('📊 DynamoDB Configuration:');
    console.log(`   Region: ${process.env.AWS_REGION || "us-west-1"}`);
    console.log(`   Table: ${TABLE_NAME}`);
    console.log(`   PK: ${TABLE_PK_NAME}`);
    console.log(`   SK: ${TABLE_SK_NAME || 'none'}`);
    console.log(`   SK Value: ${TABLE_SK_VALUE}`);
    
    // Test query
    const testUserId = 'test@example.com';
    const key = { [TABLE_PK_NAME]: testUserId };
    if (TABLE_SK_NAME) {
      key[TABLE_SK_NAME] = TABLE_SK_VALUE;
    }
    
    console.log('\n🔍 Testing DynamoDB query...');
    console.log(`   Key: ${JSON.stringify(key)}`);
    
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: key,
      ProjectionExpression: 'registeredDomains',
    });
    
    const result = await ddb.send(command);
    console.log('✅ DynamoDB query successful!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
    if (result.Item && result.Item.registeredDomains) {
      console.log(`\n🎉 Found ${result.Item.registeredDomains.length} registered domains!`);
      result.Item.registeredDomains.forEach((domain, index) => {
        console.log(`   ${index + 1}. ${domain.domain} (${domain.status})`);
      });
    } else {
      console.log('\n📝 No registered domains found for this user.');
    }
    
  } catch (error) {
    console.error('❌ DynamoDB test failed:', error.message);
    console.error('🔍 Error details:', error);
  }
}

// Run the test
testDynamoDB();
