const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

// Use the same credentials as Vercel
const region = 'us-west-1';
const tableName = 'Company_Creation_Questionaire_Avenida_Legal';

async function addDomainToVercelTable() {
  const ddbClient = new DynamoDBClient({ region });
  const ddb = DynamoDBDocumentClient.from(ddbClient);

  const userId = 'admin@partner.avenidalegal.com';
  const key = {
    id: userId,
    sk: 'DOMAINS'
  };

  console.log('Checking existing data...');
  const getCommand = new GetCommand({
    TableName: tableName,
    Key: key
  });

  try {
    const getResult = await ddb.send(getCommand);
    console.log('Current data:', getResult.Item);
  } catch (error) {
    console.log('No existing data:', error.message);
  }

  const domainData = {
    domain: 'avenidalegal.lat',
    namecheapOrderId: 'avenidalegal.lat',
    registrationDate: '2025-10-16T04:13:09.905Z',
    expiryDate: '2026-10-16T04:13:09.908Z',
    status: 'active',
    stripePaymentId: 'cs_actual_purchase',
    price: 1.8,
    sslEnabled: true,
    sslExpiryDate: '2026-10-16T04:13:09.908Z',
    googleWorkspaceStatus: 'none',
    nameservers: ['dns1.registrar-servers.com', 'dns2.registrar-servers.com']
  };

  console.log('Adding domain data...');
  const updateCommand = new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: 'SET registeredDomains = :domains',
    ExpressionAttributeValues: {
      ':domains': [domainData]
    },
    ReturnValues: 'ALL_NEW'
  });

  const result = await ddb.send(updateCommand);
  console.log('Domain added successfully!');
  console.log('Result:', result.Attributes);
}

addDomainToVercelTable().catch(console.error);

