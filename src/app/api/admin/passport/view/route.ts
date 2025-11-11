import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';

// IMPORTANT: Only these emails can access passport documents
const AUTHORIZED_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      // User not logged in - redirect to login with callback
      const callbackUrl = encodeURIComponent(request.url);
      const loginUrl = `/api/auth/signin?callbackUrl=${callbackUrl}`;
      return NextResponse.redirect(new URL(loginUrl, request.url));
    }

    // IMPORTANT: Check if user is authorized to view passports
    if (!AUTHORIZED_EMAILS.includes(session.user.email)) {
      console.warn(`⚠️ Unauthorized access attempt to passport by: ${session.user.email}`);
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
              <p>Only authorized Avenida Legal personnel can view passport documents.</p>
              <p>Your email: <span class="email">${session.user.email}</span></p>
              <p>If you believe this is an error, please contact your administrator.</p>
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

    // Get S3 key from query parameter
    const searchParams = request.nextUrl.searchParams;
    const s3Key = searchParams.get('key');

    if (!s3Key) {
      return NextResponse.json({ error: 'Missing S3 key parameter' }, { status: 400 });
    }

    // Validate that this is a passport document
    if (!s3Key.includes('/documents/ids/')) {
      console.warn(`⚠️ Invalid document path attempted: ${s3Key} by ${session.user.email}`);
      return NextResponse.json(
        { error: 'Invalid document path' },
        { status: 400 }
      );
    }

    // Generate presigned URL (expires in 1 hour)
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    // Log access for audit trail
    console.log(`✅ Passport accessed: ${s3Key} by ${session.user.email} at ${new Date().toISOString()}`);

    // Redirect to the presigned URL so the image opens directly
    return NextResponse.redirect(presignedUrl);

  } catch (error: any) {
    console.error('❌ Failed to generate presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to access document', details: error.message },
      { status: 500 }
    );
  }
}

