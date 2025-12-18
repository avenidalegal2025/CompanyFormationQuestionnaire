import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserDocuments, getUserCompanyDocuments, saveUserCompanyDocuments, getVaultMetadata } from '@/lib/dynamo';
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
    const companyId = formData.get('companyId') as string | null; // Get companyId from request

    if (!documentId || !file) {
      return NextResponse.json(
        { error: 'Missing documentId or file' },
        { status: 400 }
      );
    }

    // Try to find document in company-specific documents first, then fallback to all documents
    let document: any = null;
    let effectiveCompanyId = companyId || undefined;
    
    if (effectiveCompanyId) {
      const companyDocs = await getUserCompanyDocuments(userId, effectiveCompanyId);
      document = companyDocs.find(doc => doc.id === documentId);
    }
    
    // If not found in company-specific, search all documents
    if (!document) {
      const allDocuments = await getUserDocuments(userId);
      document = allDocuments.find(doc => doc.id === documentId);
      
      // Try to infer companyId from document's s3Key path if available
      if (document?.s3Key && !effectiveCompanyId) {
        // Extract company identifier from s3Key if possible
        // Format: "vault-path/formation/document.pdf" - vault-path might contain company info
        const s3KeyParts = document.s3Key.split('/');
        if (s3KeyParts.length > 0) {
          // The vault path might be the company identifier
          // But we can't reliably extract it, so we'll use 'default' as fallback
        }
      }
    }

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

    // Get current documents for the specific company (or all if no companyId)
    const currentDocuments = effectiveCompanyId 
      ? await getUserCompanyDocuments(userId, effectiveCompanyId)
      : await getUserDocuments(userId);
    
    // Update document record with signed version
    const updatedDocuments = currentDocuments.map(doc => {
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

    // Save using company-specific function to ensure it's stored in the right place
    await saveUserCompanyDocuments(userId, effectiveCompanyId, updatedDocuments);

    console.log(`✅ Signed document uploaded: ${uploadResult.s3Key} for document ${documentId}`);
    console.log(`📋 Document saved with companyId: ${effectiveCompanyId || 'default'}`);
    console.log(`📋 Updated document status: signedS3Key=${uploadResult.s3Key}, status=signed`);
    
    // Verify the document was saved correctly by reading it back
    const verifyDocs = await getUserCompanyDocuments(userId, effectiveCompanyId);
    const savedDoc = verifyDocs.find(d => d.id === documentId);
    if (savedDoc) {
      console.log(`✅ Verification: Document found in DB with status=${savedDoc.status}, signedS3Key=${savedDoc.signedS3Key ? 'YES' : 'NO'}`);
    } else {
      console.error(`❌ Verification FAILED: Document ${documentId} not found after save!`);
    }

    // Update Airtable with signed document URL
    try {
      const airtableRecord = await findFormationByEmail(userId);
      if (airtableRecord) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
        const signedUrl = `${baseUrl}/api/documents/view?key=${encodeURIComponent(uploadResult.s3Key)}`;
        
        // Map document ID to Airtable field name
        let airtableField: string | null = null;
        if (documentId === 'ss4-ein-application') {
          airtableField = 'SS-4 URL';
        } else if (documentId === 'form-2848-power-of-attorney') {
          airtableField = '2848 URL';
        } else if (documentId === 'form-8821-tax-authorization') {
          airtableField = '8821 URL';
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

