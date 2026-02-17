import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserCompanyDocuments } from '@/lib/dynamo';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = (session.user.email || '').toLowerCase().trim();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || undefined;

    // Fetch documents for this specific company from DynamoDB
    const documents = await getUserCompanyDocuments(userId, companyId);

    // Log when empty so we can diagnose "success page hung" (e.g. email mismatch or webhook not run)
    if (documents.length === 0) {
      console.log('[documents] Empty list for userId (first 8 chars):', userId.slice(0, 8) + '...', 'companyId:', companyId || '(latest)');
    }

    return NextResponse.json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

