const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

async function testQuery() {
  try {
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-west-1' }));
    
    const result = await ddb.send(new GetCommand({
      TableName: 'Company_Creation_Questionaire_Avenida_Legal',
      Key: { id: 'admin@partner.avenidalegal.com', sk: 'DOMAINS' }
    }));
    
    console.log('✅ Query successful!');
    console.log('Item found:', !!result.Item);
    if (result.Item) {
      console.log('Domains:', result.Item.registeredDomains?.length || 0);
      console.log('First domain:', result.Item.registeredDomains?.[0]?.domain);
    }
  } catch (error) {
    console.error('❌ Query failed:', error.message);
  }
}
testQuery();
