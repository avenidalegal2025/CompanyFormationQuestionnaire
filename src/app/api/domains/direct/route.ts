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

    // Use hardcoded values to bypass environment variable issues
    const region = 'us-west-1';
    const tableName = 'Company_Creation_Questionaire_Avenida_Legal';
    
    // Create DynamoDB client
    const ddbClient = new DynamoDBClient({ region });
    const ddb = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });

    // Use the correct key structure
    const key = { 
      id: userId, 
      sk: 'DOMAINS' 
    };

    console.log('Direct API - Query key:', key);

    // Make the query
    const command = new GetCommand({
      TableName: tableName,
      Key: key,
    });

    const result = await ddb.send(command);
    const domains = result.Item?.registeredDomains || [];
    
    console.log('Direct API - Result:', { itemFound: !!result.Item, domainsCount: domains.length });

    return NextResponse.json({
      success: true,
      domains: domains,
      count: domains.length,
      userId: userId
    });

  } catch (error) {
    console.error('Direct API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get domains',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
