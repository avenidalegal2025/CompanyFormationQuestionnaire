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
 * Generates a vault path from company name and user ID
 * Format: {company-name-slug}-{userId-hash}
 */
function generateVaultPath(companyName: string, userId: string): string {
  // Sanitize company name: lowercase, remove special chars, replace spaces with hyphens
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  
  // Create a short hash of the userId (first 8 chars)
  const hash = Buffer.from(userId).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
  
  return `${slug}-${hash}`;
}

/**
 * Creates a vault path for a company
 * Folders are created on-demand when documents are added
 * Structure:
 * /{company-name-slug}-{hash}/
 *   /formation/        (created when formation docs added)
 *   /agreements/       (created when agreements added)
 */
export async function createVaultStructure(userId: string, companyName: string): Promise<string> {
  const vaultPath = generateVaultPath(companyName, userId);
  
  console.log(`📁 Creating vault for: ${companyName} (${vaultPath})`);
  console.log(`✅ Vault path created: ${vaultPath}`);
  
  // Folders will be created automatically when documents are uploaded
  // No need to create empty placeholder folders
  
  return vaultPath;
}

/**
 * Copies a template from /templates/ folder to company's vault
 */
export async function copyTemplateToVault(
  vaultPath: string,
  templateName: string,
  destinationPath: string
): Promise<{ s3Key: string }> {
  const sourceKey = `templates/${templateName}`;
  const destinationKey = `${vaultPath}/${destinationPath}`;

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
 * Uploads a document to the company's vault
 */
export async function uploadDocument(
  vaultPath: string,
  folder: string,
  fileName: string,
  content: Buffer | string,
  mimeType: string = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<{ s3Key: string; size: number }> {
  const key = `${vaultPath}/${folder}/${fileName}`;
  
  const body = typeof content === 'string' ? Buffer.from(content) : content;
  
  console.log(`📤 Uploading document: ${fileName} to ${folder}/`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: mimeType,
      Metadata: {
        vaultPath,
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
 * Lists all documents in a company's vault
 */
export async function listUserDocuments(
  vaultPath: string
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: `${vaultPath}/`,
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

