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
    
    // First, let's just return the environment variables without making any DynamoDB calls
    const envVars = {
      AWS_REGION: process.env.AWS_REGION,
      DYNAMO_TABLE: process.env.DYNAMO_TABLE,
      DYNAMO_PK_NAME: process.env.DYNAMO_PK_NAME,
      DYNAMO_SK_NAME: process.env.DYNAMO_SK_NAME,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT_SET',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT_SET',
    };
    
    console.log('Real API - Environment variables:', envVars);
    
    // Temporarily skip DynamoDB call to see environment variables
    const domains: any[] = [];
    
    console.log('Real API - Skipping DynamoDB call for now');

    return NextResponse.json({
      success: true,
      domains: domains,
      count: domains.length,
      userId: userId,
      source: 'real_dynamodb',
      debug: {
        envVars: envVars
      }
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
