#!/usr/bin/env node

/**
 * Script to add domain with correct user email
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

async function addDomainWithCorrectEmail() {
  console.log('🔧 Adding domain with correct user email...\n');
  
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
    const userId = "admin@partner.avenidalegal.com"; // Your actual email
    
    // Domain data for the domain you already purchased
    const domainData = {
      domain: "mytestdomain456.lat",
      namecheapOrderId: "mytestdomain456.lat",
      registrationDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      stripePaymentId: 'cs_test_manual_entry',
      price: 2.00,
      sslEnabled: true,
      sslExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      googleWorkspaceStatus: 'none',
      nameservers: ['dns1.registrar-servers.com', 'dns2.registrar-servers.com']
    };

    console.log(`📊 Adding domain for user: ${userId}`);
    console.log('📊 Domain data:');
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
        console.log(`\n📝 Found ${existingDomains.length} existing domains for ${userId}`);
      }
    } catch (error) {
      console.log(`\n📝 No existing domains found for ${userId}, creating new entry`);
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
    console.log(`   Make sure you\'re signed in as: ${userId}`);
    
  } catch (error) {
    console.error('❌ Failed to add domain:', error.message);
    console.error('🔍 Error details:', error);
  }
}

// Run the script
addDomainWithCorrectEmail();
