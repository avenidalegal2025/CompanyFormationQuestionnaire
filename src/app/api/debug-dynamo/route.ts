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

    // Get environment variables
    const region = process.env.AWS_REGION || 'us-west-1';
    const tableName = process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal';
    const pkName = process.env.DYNAMO_PK_NAME || 'id';
    const skName = process.env.DYNAMO_SK_NAME || 'sk';
    const skValue = process.env.DYNAMO_SK_VALUE || 'DOMAINS';

    console.log('Environment variables:', {
      region,
      tableName,
      pkName,
      skName,
      skValue
    });

    // Create DynamoDB client
    const ddbClient = new DynamoDBClient({ region });
    const ddb = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });

    // Build the key
    const key: Record<string, any> = { [pkName]: userId };
    if (skName) {
      key[skName] = skValue;
    }

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
      environment: {
        region,
        tableName,
        pkName,
        skName,
        skValue
      },
      key: key,
      result: {
        itemFound: !!result.Item,
        domains: result.Item?.registeredDomains || [],
        domainCount: result.Item?.registeredDomains?.length || 0
      }
    });

  } catch (error) {
    console.error('Debug DynamoDB error:', error);
    return NextResponse.json(
      {
        error: 'Failed to debug DynamoDB',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
