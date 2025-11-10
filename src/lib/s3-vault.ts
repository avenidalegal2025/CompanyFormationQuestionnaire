import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  ListObjectsV2Command,
  CopyObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';

export interface DocumentMetadata {
  id: string;
  name: string;
  type: 'formation' | 'agreement' | 'tax' | 'banking' | 'other';
  s3Key: string;
  status: 'template' | 'generated' | 'pending_signature' | 'signed';
  createdAt: string;
  size?: number;
}

/**
 * Creates a vault folder structure in S3 for a user
 * Structure:
 * /{userId}/
 *   /formation/
 *   /agreements/
 *   /tax/
 *   /banking/
 *   /other/
 */
export async function createVaultStructure(userId: string): Promise<void> {
  const folders = [
    'formation',
    'agreements',
    'tax',
    'banking',
    'other',
  ];

  console.log(`📁 Creating vault structure for user: ${userId}`);

  // Create placeholder files to establish folder structure
  const promises = folders.map(async (folder) => {
    const key = `${userId}/${folder}/.keep`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: '',
        ContentType: 'text/plain',
      })
    );
    console.log(`  ✓ Created folder: ${folder}/`);
  });

  await Promise.all(promises);
  console.log(`✅ Vault structure created for user: ${userId}`);
}

/**
 * Copies a template from /templates/ folder to user's vault
 */
export async function copyTemplateToVault(
  userId: string,
  templateName: string,
  destinationPath: string
): Promise<{ s3Key: string }> {
  const sourceKey = `templates/${templateName}`;
  const destinationKey = `${userId}/${destinationPath}`;

  console.log(`📄 Copying template: ${templateName} → ${destinationPath}`);

  await s3Client.send(
    new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/${sourceKey}`,
      Key: destinationKey,
    })
  );

  console.log(`  ✓ Copied to: ${destinationKey}`);

  return { s3Key: destinationKey };
}

/**
 * Uploads a document to the user's vault
 */
export async function uploadDocument(
  userId: string,
  folder: string,
  fileName: string,
  content: Buffer | string,
  mimeType: string = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<{ s3Key: string; size: number }> {
  const key = `${userId}/${folder}/${fileName}`;
  
  const body = typeof content === 'string' ? Buffer.from(content) : content;
  
  console.log(`📤 Uploading document: ${fileName} to ${folder}/`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: mimeType,
      Metadata: {
        userId,
        uploadedAt: new Date().toISOString(),
      },
    })
  );

  console.log(`  ✓ Uploaded: ${key} (${body.length} bytes)`);

  return {
    s3Key: key,
    size: body.length,
  };
}

/**
 * Generates a presigned URL for document download (expires in 1 hour)
 */
export async function getDocumentDownloadUrl(
  s3Key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  console.log(`🔗 Generated download URL for: ${s3Key} (expires in ${expiresIn}s)`);
  
  return url;
}

/**
 * Lists all documents in a user's vault
 */
export async function listUserDocuments(
  userId: string
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: `${userId}/`,
  });

  const response = await s3Client.send(command);
  
  if (!response.Contents) {
    return [];
  }

  return response.Contents
    .filter((obj) => obj.Key && !obj.Key.endsWith('/.keep'))
    .map((obj) => ({
      key: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
    }));
}

/**
 * Gets a document from S3
 */
export async function getDocument(s3Key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  });

  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error('Document not found');
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}

