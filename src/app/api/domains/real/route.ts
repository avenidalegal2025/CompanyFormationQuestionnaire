import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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
    
    // Try different key structures to find the correct one
    const key = {
      pk: userId,
      sk: 'DOMAINS'
    };
    
    console.log('Real API - Querying with key:', key);
    
    const command = new GetCommand({
      TableName: tableName,
      Key: key
    });
    
    const result = await ddb.send(command);
    const domains = result.Item?.registeredDomains || [];
    
    console.log('Real API - Result:', { 
      itemFound: !!result.Item,
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
