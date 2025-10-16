import { NextRequest, NextResponse } from 'next/server';
import { getDomainsByUser } from '@/lib/dynamo';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Test DynamoDB connection without authentication
    const domains = await getDomainsByUser(userId);
    
    return NextResponse.json({
      success: true,
      userId: userId,
      domains: domains,
      count: domains.length,
      message: domains.length > 0 ? 'Domains found!' : 'No domains found'
    });

  } catch (error) {
    console.error('Test domains error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get domains',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
