import { NextRequest, NextResponse } from 'next/server';
import { getDomainsByUser } from '@/lib/dynamo';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Test DynamoDB connection
    const domains = await getDomainsByUser(userId);
    
    return NextResponse.json({
      success: true,
      userId: userId,
      domains: domains,
      count: domains.length,
      config: {
        region: process.env.AWS_REGION,
        table: process.env.DYNAMO_TABLE,
        pkName: process.env.DYNAMO_PK_NAME,
        skName: process.env.DYNAMO_SK_NAME,
        skValue: process.env.DYNAMO_SK_VALUE
      }
    });

  } catch (error) {
    console.error('Test DynamoDB error:', error);
    return NextResponse.json(
      {
        error: 'Failed to test DynamoDB',
        details: error instanceof Error ? error.message : 'Unknown error',
        config: {
          region: process.env.AWS_REGION,
          table: process.env.DYNAMO_TABLE,
          pkName: process.env.DYNAMO_PK_NAME,
          skName: process.env.DYNAMO_SK_NAME,
          skValue: process.env.DYNAMO_SK_VALUE
        }
      },
      { status: 500 }
    );
  }
}
