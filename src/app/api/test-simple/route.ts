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

    // Hardcode the correct values to bypass any environment variable issues
    const region = 'us-west-1';
    const tableName = 'Company_Creation_Questionaire_Avenida_Legal';
    
    console.log('Testing with hardcoded values:', { region, tableName, userId });

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

    console.log('Query key:', key);

    // Make the query
    const command = new GetCommand({
      TableName: tableName,
      Key: key,
    });

    const result = await ddb.send(command);
    
    return NextResponse.json({
      success: true,
      userId: userId,
      key: key,
      result: {
        itemFound: !!result.Item,
        domains: result.Item?.registeredDomains || [],
        domainCount: result.Item?.registeredDomains?.length || 0,
        firstDomain: result.Item?.registeredDomains?.[0]?.domain || null
      }
    });

  } catch (error) {
    console.error('Simple test error:', error);
    return NextResponse.json(
      {
        error: 'Failed to test DynamoDB',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
