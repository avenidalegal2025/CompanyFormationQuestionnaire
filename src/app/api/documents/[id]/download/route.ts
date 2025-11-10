import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserDocuments } from '@/lib/dynamo';
import { getDocumentDownloadUrl } from '@/lib/s3-vault';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.email;
    const { id: documentId } = await params;

    // Fetch user's documents to verify ownership
    const documents = await getUserDocuments(userId);
    const document = documents.find(doc => doc.id === documentId);

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Generate presigned URL (expires in 1 hour)
    const downloadUrl = await getDocumentDownloadUrl(document.s3Key, 3600);

    return NextResponse.json({
      success: true,
      url: downloadUrl,
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
      },
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}

