// src/app/api/domains/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDomainsByUser } from '@/lib/dynamo';

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

    // Check if DynamoDB is configured
    if (!process.env.AWS_REGION || !process.env.DYNAMO_TABLE) {
      return NextResponse.json(
        { 
          error: 'Database not configured',
          details: 'AWS_REGION and DYNAMO_TABLE environment variables are required'
        }, 
        { status: 503 }
      );
    }

    // Get domains from DynamoDB
    const domains = await getDomainsByUser(userId);

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
