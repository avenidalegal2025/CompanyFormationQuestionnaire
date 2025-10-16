#!/usr/bin/env node

/**
 * Script to manually add existing domain to DynamoDB
 * This will make the domain appear in the UI
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

async function addExistingDomain() {
  console.log('🔧 Adding existing domain to DynamoDB...\n');
  
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
    const userId = "test@example.com"; // Replace with your actual user email
    
    // Domain data for the domain you already purchased
    const domainData = {
      domain: "mytestdomain456.lat", // Replace with your actual domain
      namecheapOrderId: "mytestdomain456.lat", // Use domain as ID
      registrationDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
      status: 'active',
      stripePaymentId: 'cs_test_manual_entry',
      price: 2.00, // Amount charged by Namecheap
      sslEnabled: true,
      sslExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      googleWorkspaceStatus: 'none',
      nameservers: ['dns1.registrar-servers.com', 'dns2.registrar-servers.com']
    };

    console.log('📊 Domain data to add:');
    console.log(JSON.stringify(domainData, null, 2));
    
    // First, try to get existing domains
    let existingDomains = [];
    try {
      const getCommand = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: userId, sk: 'DOMAINS' },
        ProjectionExpression: 'registeredDomains',
      });
      const { Item } = await ddb.send(getCommand);
      if (Item && Item.registeredDomains) {
        existingDomains = Item.registeredDomains;
        console.log(`\n📝 Found ${existingDomains.length} existing domains`);
      }
    } catch (error) {
      console.log('\n📝 No existing domains found, creating new entry');
    }

    // Add the new domain to the list
    const updatedDomains = [...existingDomains, domainData];

    // Update the database
    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id: userId, sk: 'DOMAINS' },
      UpdateExpression: 'SET registeredDomains = :domains',
      ExpressionAttributeValues: {
        ':domains': updatedDomains,
      },
      ReturnValues: 'UPDATED_NEW',
    });

    console.log('\n💾 Saving to DynamoDB...');
    const result = await ddb.send(command);
    console.log('✅ Domain added successfully!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
    console.log('\n🎉 Domain should now appear in your UI!');
    console.log('   Go to: https://company-formation-questionnaire.vercel.app/client/domains');
    
  } catch (error) {
    console.error('❌ Failed to add domain:', error.message);
    console.error('🔍 Error details:', error);
  }
}

// Run the script
addExistingDomain();
