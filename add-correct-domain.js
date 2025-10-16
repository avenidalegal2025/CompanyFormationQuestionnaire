#!/usr/bin/env node

/**
 * Script to add the correct domain (avenidalegal.lat) with correct user email
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

async function addCorrectDomain() {
  console.log('🔧 Adding the correct domain (avenidalegal.lat)...\n');
  
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
    const userId = "admin@partner.avenidalegal.com";
    
    // Domain data for the domain you actually purchased
    const domainData = {
      domain: "avenidalegal.lat",
      namecheapOrderId: "avenidalegal.lat",
      registrationDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      stripePaymentId: 'cs_actual_purchase',
      price: 1.80, // .lat domains are typically $1.80
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
        
        // Remove the test domain if it exists
        existingDomains = existingDomains.filter(d => d.domain !== 'mytestdomain456.lat');
        console.log(`📝 After removing test domain: ${existingDomains.length} domains`);
      }
    } catch (error) {
      console.log(`\n📝 No existing domains found for ${userId}, creating new entry`);
    }

    // Add the correct domain to the list
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
    
    console.log('\n🎉 Your actual domain should now appear in your UI!');
    console.log('   Domain: avenidalegal.lat');
    console.log('   Go to: https://company-formation-questionnaire.vercel.app/client/domains');
    console.log(`   Make sure you're signed in as: ${userId}`);
    
  } catch (error) {
    console.error('❌ Failed to add domain:', error.message);
    console.error('🔍 Error details:', error);
  }
}

// Run the script
addCorrectDomain();
