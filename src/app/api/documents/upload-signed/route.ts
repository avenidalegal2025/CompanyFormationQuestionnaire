import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserDocuments, saveUserDocuments, getVaultMetadata } from '@/lib/dynamo';
import { uploadDocument } from '@/lib/s3-vault';
import { findFormationByEmail, updateFormationRecord } from '@/lib/airtable';

export async function POST(request: NextRequest) {
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
    const formData = await request.formData();
    const documentId = formData.get('documentId') as string;
    const file = formData.get('file') as File;

    if (!documentId || !file) {
      return NextResponse.json(
        { error: 'Missing documentId or file' },
        { status: 400 }
      );
    }

    // Verify document ownership
    const documents = await getUserDocuments(userId);
    const document = documents.find(doc => doc.id === documentId);

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Get vault path
    const vaultMetadata = await getVaultMetadata(userId);
    if (!vaultMetadata?.vaultPath) {
      return NextResponse.json(
        { error: 'Vault not found' },
        { status: 404 }
      );
    }

    const vaultPath = vaultMetadata.vaultPath;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate signed document filename
    const originalFileName = file.name;
    const fileExtension = originalFileName.split('.').pop() || 'pdf';
    const signedFileName = `${document.id}_signed.${fileExtension}`;

    // Upload to S3 in the same folder as the original document
    // Extract folder from original s3Key (e.g., "vault-path/formation/SS-4_Company.pdf" -> "formation")
    const folderMatch = document.s3Key.match(/\/([^\/]+)\/[^\/]+$/);
    const folder = folderMatch ? folderMatch[1] : 'formation';

    const uploadResult = await uploadDocument(
      vaultPath,
      folder,
      signedFileName,
      buffer,
      file.type || 'application/pdf'
    );

    // Update document record with signed version
    const updatedDocuments = documents.map(doc => {
      if (doc.id === documentId) {
        return {
          ...doc,
          signedS3Key: uploadResult.s3Key,
          status: 'signed' as const,
          signedAt: new Date().toISOString(),
        };
      }
      return doc;
    });

    await saveUserDocuments(userId, updatedDocuments);

    console.log(`✅ Signed document uploaded: ${uploadResult.s3Key} for document ${documentId}`);

    // Update Airtable with signed document URL
    try {
      const airtableRecord = await findFormationByEmail(userId);
      if (airtableRecord) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
        const signedUrl = `${baseUrl}/api/documents/view?key=${encodeURIComponent(uploadResult.s3Key)}`;
        
        // Map document ID to Airtable field name
        let airtableField: string | null = null;
        if (documentId === 'ss4-ein-application') {
          airtableField = 'SS-4 EIN Application URL';
        } else if (documentId === 'form-2848-power-of-attorney') {
          airtableField = 'Form 2848 Power of Attorney URL';
        } else if (documentId === 'form-8821-tax-authorization') {
          airtableField = 'Form 8821 Tax Authorization URL';
        }
        
        if (airtableField) {
          await updateFormationRecord(airtableRecord.id, {
            [airtableField]: signedUrl,
          } as any);
          console.log(`✅ Updated Airtable field ${airtableField} with signed document URL`);
        }
      } else {
        console.log('⚠️ Airtable record not found for user, skipping Airtable update');
      }
    } catch (airtableError: any) {
      console.error('❌ Failed to update Airtable with signed document:', airtableError.message);
      // Don't fail the upload if Airtable update fails
    }

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        signedS3Key: uploadResult.s3Key,
        status: 'signed',
        signedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error uploading signed document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload signed document' },
      { status: 500 }
    );
  }
}

