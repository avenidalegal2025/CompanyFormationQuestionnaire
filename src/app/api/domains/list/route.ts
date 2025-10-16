// src/app/api/domains/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Verify the userId matches the session user
    if (userId !== session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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

    // Make the query
    const command = new GetCommand({
      TableName: tableName,
      Key: key,
    });

    const result = await ddb.send(command);
    const domains = result.Item?.registeredDomains || [];

    return NextResponse.json({
      success: true,
      domains: domains,
      count: domains.length
    });

  } catch (error) {
    console.error('Error fetching domains:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch domains',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
