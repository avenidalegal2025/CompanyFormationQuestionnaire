import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = 'llc-filing-audit-trail-rodolfo';

// Only these emails can access filing screenshots
const AUTHORIZED_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    
    console.log('🔐 Screenshots auth check:', {
      hasSession: !!session,
      email: session?.user?.email,
      emailLower: session?.user?.email?.toLowerCase(),
      authorizedEmails: AUTHORIZED_EMAILS,
    });
    
    if (!session?.user?.email) {
      console.log('❌ No session, redirecting to login');
      const callbackUrl = encodeURIComponent(request.url);
      const loginUrl = `/api/auth/signin?callbackUrl=${callbackUrl}`;
      return NextResponse.redirect(new URL(loginUrl, request.url));
    }

    // Check if user is authorized (case-insensitive)
    const userEmail = session.user.email.toLowerCase().trim();
    const isAuthorized = AUTHORIZED_EMAILS.some(email => email.toLowerCase().trim() === userEmail);
    
    console.log('🔐 Authorization result:', { userEmail, isAuthorized });
    
    if (!isAuthorized) {
      console.log(`❌ Unauthorized: ${userEmail} not in authorized list`);
      return NextResponse.json({ error: 'Unauthorized', email: userEmail }, { status: 403 });
    }

    // Get company name from query parameter
    const searchParams = request.nextUrl.searchParams;
    const company = searchParams.get('company');

    if (!company) {
      return NextResponse.json({ error: 'Missing company parameter' }, { status: 400 });
    }

    // Convert company name to S3 folder format (same as in email notification)
    const s3FolderName = company.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const prefix = `${s3FolderName}/screenshots/`;

    console.log(`📸 Listing screenshots for: ${company} (prefix: ${prefix})`);

    // List objects in the screenshots folder
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    });

    const listResult = await s3Client.send(listCommand);
    const objects = listResult.Contents || [];

    // Filter for image files and generate presigned URLs
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const screenshots = await Promise.all(
      objects
        .filter(obj => {
          const key = obj.Key || '';
          return imageExtensions.some(ext => key.toLowerCase().endsWith(ext));
        })
        .sort((a, b) => {
          // Sort by filename (usually numbered like 01_step.png, 02_step.png)
          const nameA = a.Key?.split('/').pop() || '';
          const nameB = b.Key?.split('/').pop() || '';
          return nameA.localeCompare(nameB);
        })
        .map(async (obj) => {
          const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: obj.Key,
          });
          
          // Generate presigned URL valid for 1 hour
          const url = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
          
          return {
            key: obj.Key,
            name: obj.Key?.split('/').pop() || 'unknown',
            url,
            size: obj.Size,
            lastModified: obj.LastModified,
          };
        })
    );

    console.log(`📸 Found ${screenshots.length} screenshots for ${company}`);

    return NextResponse.json({
      company,
      folder: s3FolderName,
      count: screenshots.length,
      screenshots,
    });

  } catch (error: any) {
    console.error('❌ Error fetching screenshots:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

