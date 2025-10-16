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
    
    // Direct DynamoDB query with hardcoded values that work
    const ddbClient = new DynamoDBClient({ 
      region: 'us-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    });
    
    const ddb = DynamoDBDocumentClient.from(ddbClient);
    
    const command = new GetCommand({
      TableName: 'Company_Creation_Questionaire_Avenida_Legal',
      Key: {
        id: userId,
        sk: 'DOMAINS'
      }
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
