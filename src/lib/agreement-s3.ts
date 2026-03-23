import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_DOCUMENTS_BUCKET || "avenida-legal-documents";

/**
 * Upload a generated agreement document to S3.
 */
export async function uploadAgreementDocument(
  draftId: string,
  filename: string,
  buffer: Buffer
): Promise<{ s3Key: string; downloadUrl: string }> {
  const s3Key = `agreements/${draftId}/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  );

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    { expiresIn: 604800 } // 7 days
  );

  return { s3Key, downloadUrl };
}
