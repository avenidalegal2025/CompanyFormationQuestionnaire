import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getUserDocuments } from '@/lib/dynamo';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';

// Authorized lawyer emails who can view ANY document
const LAWYER_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

export async function GET(request: NextRequest) {
  try {
    // Log cookies for debugging
    const cookies = request.cookies.getAll();
    console.log('🍪 Document view - Cookies received:', cookies.map(c => c.name));
    
    // Authenticate user - CRITICAL: This must happen on every request
    const session = await getServerSession(authOptions);
    
    console.log('🔐 Document view - Auth check:', {
      hasSession: !!session,
      email: session?.user?.email,
      url: request.url,
    });
    
    if (!session?.user?.email) {
      console.warn('⚠️ Unauthenticated access attempt to document');
      // User not logged in - redirect to login with callback
      const callbackUrl = encodeURIComponent(request.url);
      const loginUrl = `/api/auth/signin?callbackUrl=${callbackUrl}`;
      return NextResponse.redirect(new URL(loginUrl, request.url));
    }

    const userEmail = session.user.email;
    const isLawyer = LAWYER_EMAILS.includes(userEmail);

    // Get S3 key from query parameter
    const searchParams = request.nextUrl.searchParams;
    const s3Key = searchParams.get('key');
    const documentId = searchParams.get('id'); // Optional: for client access by document ID

    if (!s3Key && !documentId) {
      return NextResponse.json(
        { error: 'Missing S3 key or document ID parameter' },
        { status: 400 }
      );
    }

    let finalS3Key = s3Key;

    // If accessing by document ID (client dashboard), verify ownership
    // Prefer signed version if available, otherwise use original
    if (documentId && !s3Key) {
      const userDocuments = await getUserDocuments(userEmail);
      const document = userDocuments.find(doc => doc.id === documentId);
      
      if (!document) {
        console.warn(`⚠️ Document not found: ${documentId} for user ${userEmail}`);
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }
      
      // Prefer signed version if available, otherwise use original
      finalS3Key = document.signedS3Key || document.s3Key;
    }

    // If accessing by S3 key (Airtable link), verify authorization
    if (s3Key && !isLawyer) {
      // Non-lawyer trying to access via S3 key - verify they own this document
      // Check both original and signed versions
      const userDocuments = await getUserDocuments(userEmail);
      const ownsDocument = userDocuments.some(doc => 
        doc.s3Key === s3Key || doc.signedS3Key === s3Key
      );
      
      if (!ownsDocument) {
        console.warn(`⚠️ Unauthorized document access attempt by: ${userEmail} for key: ${s3Key}`);
        return new NextResponse(
          `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Access Denied</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  background: #f3f4f6;
                }
                .container {
                  text-align: center;
                  padding: 2rem;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                  max-width: 500px;
                }
                h1 { color: #dc2626; margin-bottom: 1rem; }
                p { color: #6b7280; line-height: 1.6; }
                .email { color: #3b82f6; font-weight: 600; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>🚫 Access Denied</h1>
                <p>You do not have permission to view this document.</p>
                <p>Your email: <span class="email">${userEmail}</span></p>
                <p>If you believe this is an error, please contact support.</p>
              </div>
            </body>
          </html>
          `,
          {
            status: 403,
            headers: { 'Content-Type': 'text/html' },
          }
        );
      }
    }

    if (!finalS3Key) {
      return NextResponse.json(
        { error: 'Unable to determine document location' },
        { status: 400 }
      );
    }

    // Validate document path (must be in valid folders)
    const validPaths = ['/formation/', '/agreements/', '/documents/'];
    const isValidPath = validPaths.some(path => finalS3Key!.includes(path));
    
    if (!isValidPath) {
      console.warn(`⚠️ Invalid document path attempted: ${finalS3Key} by ${userEmail}`);
      return NextResponse.json(
        { error: 'Invalid document path' },
        { status: 400 }
      );
    }

    // SECURITY: Stream the document through our server instead of presigned URL
    // This ensures authentication is checked on EVERY access
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: finalS3Key,
    });

    const s3Response = await s3Client.send(command);
    
    if (!s3Response.Body) {
      throw new Error('No file content received from S3');
    }

    // Log access for audit trail
    console.log(`✅ Document accessed: ${finalS3Key} by ${userEmail} (${isLawyer ? 'LAWYER' : 'CLIENT'}) at ${new Date().toISOString()}`);

    // Convert S3 stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of s3Response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Determine content type
    const contentType = s3Response.ContentType || 
      (finalS3Key.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 
       finalS3Key.endsWith('.pdf') ? 'application/pdf' : 
       'application/octet-stream');

    // Extract filename from S3 key
    const fileName = finalS3Key.split('/').pop() || 'document';

    // Return the document directly with proper headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        // Prevent caching to ensure auth is checked every time
      },
    });

  } catch (error: any) {
    console.error('❌ Failed to retrieve document:', error);
    
    // Handle S3 NoSuchKey error
    if (error.name === 'NoSuchKey') {
      return NextResponse.json(
        { error: 'Document not found in storage' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to access document', details: error.message },
      { status: 500 }
    );
  }
}

