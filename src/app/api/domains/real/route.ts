import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDomainsByUserSafe } from '@/lib/dynamo';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    console.log('Real API - Getting domains for user:', userId, {
      table: process.env.DYNAMO_TABLE,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)
    });
    
    const region = process.env.AWS_REGION || 'us-west-1';
    const tableName = process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal';
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ 
      region,
      credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      } : undefined
    }));

    // With env aligned to pk/sk, use single Get via shared helper
    const domains: any[] = await getDomainsByUserSafe(userId);

    return NextResponse.json({
      success: true,
      domains,
      count: domains.length,
      userId,
      source: 'real_dynamodb'
    });

  } catch (error) {
    console.error('Domains API fatal error; returning empty:', error);
    return NextResponse.json({ success: false, domains: [], count: 0, note: 'Handled error' });
  }
}
