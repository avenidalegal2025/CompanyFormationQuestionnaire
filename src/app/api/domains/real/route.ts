import { NextRequest, NextResponse } from 'next/server';
import { getDomainsByUser } from '@/lib/dynamo';

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
    
    // Use the shared library with correct key schema
    const domains = await getDomainsByUser(userId);
    
    console.log('Real API - Result:', { 
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
