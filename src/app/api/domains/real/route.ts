import { NextRequest, NextResponse } from 'next/server';
import { getDomainsByUser } from '@/lib/dynamo';
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
    
    // Test direct DynamoDB query to debug
    const ddbClient = new DynamoDBClient({ 
      region: process.env.AWS_REGION || 'us-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    });
    
    const ddb = DynamoDBDocumentClient.from(ddbClient);
    
    const testKey = {
      id: userId,
      sk: 'DOMAINS'
    };
    
    console.log('Real API - Testing with key:', testKey);
    
    const testCommand = new GetCommand({
      TableName: process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal',
      Key: testKey
    });
    
    const testResult = await ddb.send(testCommand);
    console.log('Real API - Direct query result:', {
      itemFound: !!testResult.Item,
      keys: testResult.Item ? Object.keys(testResult.Item) : [],
      domainsCount: testResult.Item?.registeredDomains?.length || 0
    });
    
    // Use the shared library with correct key schema
    const domains = await getDomainsByUser(userId);
    
    console.log('Real API - Shared library result:', { 
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
