import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Direct DynamoDB connection with hardcoded values
    const region = 'us-west-1';
    const tableName = 'Company_Creation_Questionaire_Avenida_Legal';
    
    console.log('Real API - Connecting to DynamoDB:', { region, tableName, userId });
    
    // Create DynamoDB client
    const ddbClient = new DynamoDBClient({ 
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    });
    
    const ddb = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });

    // Use scan with filter to bypass key schema issues
    console.log('Real API - Scanning for user:', userId);

    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': userId
      }
    });

    const result = await ddb.send(command);
    const domains = result.Items?.[0]?.registeredDomains || [];
    
    console.log('Real API - Result:', { 
      itemsFound: result.Items?.length || 0, 
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
