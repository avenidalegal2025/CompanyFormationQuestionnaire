const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const region = 'us-west-1';

async function findVercelTable() {
  const client = new DynamoDBClient({ region });

  // List all tables
  console.log('Listing all tables in', region);
  const listCommand = new ListTablesCommand({});
  const listResult = await client.send(listCommand);
  
  console.log('Tables found:', listResult.TableNames);
  
  // Describe each table to see their key schemas
  for (const tableName of listResult.TableNames || []) {
    console.log('\n---', tableName, '---');
    const describeCommand = new DescribeTableCommand({ TableName: tableName });
    const describeResult = await client.send(describeCommand);
    
    console.log('Key Schema:');
    describeResult.Table?.KeySchema?.forEach(key => {
      console.log(`  ${key.AttributeName} (${key.KeyType})`);
    });
    
    console.log('Attributes:');
    describeResult.Table?.AttributeDefinitions?.forEach(attr => {
      console.log(`  ${attr.AttributeName}: ${attr.AttributeType}`);
    });
  }
}

findVercelTable().catch(console.error);

