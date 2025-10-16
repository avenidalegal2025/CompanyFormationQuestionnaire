import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    console.log('Real API - Getting domains for user:', userId);
    console.log('Real API - Environment variables:', {
      region: process.env.AWS_REGION,
      tableName: process.env.DYNAMO_TABLE,
      pkName: process.env.DYNAMO_PK_NAME,
      skName: process.env.DYNAMO_SK_NAME
    });
    
    // Use hardcoded values that we know work locally
    const region = 'us-west-1';
    const tableName = 'Company_Creation_Questionaire_Avenida_Legal';
    
    console.log('Real API - Using hardcoded values:', { region, tableName, userId });
    
    // Create DynamoDB client with hardcoded credentials
    const ddbClient = new DynamoDBClient({ 
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    });
    
    const ddb = DynamoDBDocumentClient.from(ddbClient);
    
    // Use the correct key structure based on environment variables
    const key = {
      id: userId,
      sk: 'DOMAINS'
    };
    
    console.log('Real API - Querying with key:', key);
    
    // Try GetCommand first
    const getCommand = new GetCommand({
      TableName: tableName,
      Key: key
    });
    
    const getResult = await ddb.send(getCommand);
    console.log('Real API - GetCommand result:', { 
      itemFound: !!getResult.Item,
      keys: getResult.Item ? Object.keys(getResult.Item) : []
    });
    
    let domains = getResult.Item?.registeredDomains || [];
    
    // If no data found with GetCommand, try ScanCommand to see what's in the table
    if (domains.length === 0) {
      console.log('Real API - No data found with GetCommand, trying ScanCommand');
      const scanCommand = new ScanCommand({
        TableName: tableName,
        Limit: 10 // Limit to first 10 items to see what's in the table
      });
      
      const scanResult = await ddb.send(scanCommand);
      console.log('Real API - ScanCommand result:', { 
        itemsFound: scanResult.Items?.length || 0,
        firstItemKeys: scanResult.Items?.[0] ? Object.keys(scanResult.Items[0]) : [],
        allItems: scanResult.Items?.map(item => ({
          keys: Object.keys(item),
          id: item.id,
          sk: item.sk,
          hasDomains: !!item.registeredDomains
        })) || []
      });
      
      // Look for our specific user
      const userItem = scanResult.Items?.find(item => item.id === userId);
      if (userItem) {
        domains = userItem.registeredDomains || [];
        console.log('Real API - Found user data in scan:', { domainsCount: domains.length });
      }
    }
    
    console.log('Real API - Final result:', { 
      domainsCount: domains.length,
      firstDomain: domains[0]?.domain 
    });

    return NextResponse.json({
      success: true,
      domains: domains,
      count: domains.length,
      userId: userId,
      source: 'real_dynamodb'
    });

  } catch (error) {
    console.error('Real API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get domains from DynamoDB',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
