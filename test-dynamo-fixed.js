#!/usr/bin/env node

/**
 * Test script to verify DynamoDB connection with correct key structure
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

async function testDynamoDBFixed() {
  console.log('🧪 Testing DynamoDB with correct key structure...\n');
  
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

    const TABLE_NAME = "Company_Creation_Questionaire_Avenida_Legal";
    const testUserId = 'test@example.com';
    
    // Use the correct composite key structure
    const key = { 
      id: testUserId, 
      sk: 'DOMAINS' 
    };
    
    console.log('🔍 Testing DynamoDB query with correct key...');
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
        console.log(`   ${index + 1}. ${domain.domain} (${domain.status}) - $${domain.price}`);
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
testDynamoDBFixed();
