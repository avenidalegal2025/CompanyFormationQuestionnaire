import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ownerIndex = formData.get('ownerIndex') as string;
    const ownerName = formData.get('ownerName') as string;
    const vaultPath = formData.get('vaultPath') as string; // e.g., "tech-corp-abc123"

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ownerName || !vaultPath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(file.type)) {
      const errorMessage = fileExtension === 'pdf' 
        ? 'Formato incorrecto. El archivo es PDF pero solo se aceptan imágenes PNG o JPEG.'
        : `Formato incorrecto. Solo se aceptan archivos PNG o JPEG. El archivo subido es: ${fileExtension || 'desconocido'}.`;
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `El archivo es demasiado grande. El tamaño máximo permitido es 10MB. El archivo subido tiene ${(file.size / (1024 * 1024)).toFixed(2)}MB.` },
        { status: 400 }
      );
    }

    // Generate filename: owner-name-passport-timestamp.ext
    const fileExtension = file.name.split('.').pop();
    const timestamp = Date.now();
    const sanitizedOwnerName = ownerName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const fileName = `${sanitizedOwnerName}-passport-${timestamp}.${fileExtension}`;

    // Create S3 key: {vault-path}/documents/ids/{filename}
    const s3Key = `${vaultPath}/documents/ids/${fileName}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3 with private ACL
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        uploadedBy: session.user.email,
        ownerIndex: ownerIndex,
        ownerName: ownerName,
        uploadedAt: new Date().toISOString(),
      },
      // IMPORTANT: Files are private by default (no public access)
      ServerSideEncryption: 'AES256', // Enable encryption at rest
    });

    await s3Client.send(uploadCommand);

    console.log(`✅ Passport uploaded: ${s3Key} by ${session.user.email}`);

    return NextResponse.json({
      success: true,
      s3Key: s3Key,
      fileName: fileName,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('❌ Passport upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error.message },
      { status: 500 }
    );
  }
}

