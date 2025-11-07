import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGoogleWorkspace } from '@/lib/dynamo';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const workspace = await getGoogleWorkspace(session.user.email);
    
    return NextResponse.json({
      success: true,
      workspace: workspace || null,
    });
  } catch (error) {
    console.error('Error fetching Google Workspace:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Google Workspace data' },
      { status: 500 }
    );
  }
}

