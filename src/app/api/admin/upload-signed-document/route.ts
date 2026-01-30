import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Airtable from 'airtable';
import { getUserCompanyDocuments, saveUserCompanyDocuments } from '@/lib/dynamo';
import { uploadDocument } from '@/lib/s3-vault';
import { updateFormationRecord } from '@/lib/airtable';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

const AUTHORIZED_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminEmail = session.user.email.toLowerCase().trim();
    const isAuthorized = AUTHORIZED_EMAILS.some(email => email.toLowerCase().trim() === adminEmail);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized', email: adminEmail }, { status: 403 });
    }

    const formData = await request.formData();
    const recordId = (formData.get('recordId') as string | null)?.trim();
    const documentId = (formData.get('documentId') as string | null)?.trim();
    const file = formData.get('file') as File | null;

    if (!recordId || !documentId || !file) {
      return NextResponse.json(
        { error: 'Missing recordId, documentId, or file' },
        { status: 400 }
      );
    }

    const record = await base(AIRTABLE_TABLE_NAME).find(recordId);
    const fields = record.fields;
    const customerEmail = ((fields['Customer Email'] as string) || '').toLowerCase().trim();
    if (!customerEmail) {
      return NextResponse.json(
        { error: 'Airtable record is missing Customer Email' },
        { status: 400 }
      );
    }

    const documents = await getUserCompanyDocuments(customerEmail, recordId);
    const existingDoc = documents.find(doc => doc.id === documentId);
    if (!existingDoc?.s3Key) {
      return NextResponse.json(
        { error: 'Document not found for this company' },
        { status: 404 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileExtension = file.name.split('.').pop() || 'pdf';
    const signedFileName = `${documentId}_signed.${fileExtension}`;

    const folderMatch = existingDoc.s3Key.match(/\/([^\/]+)\/[^\/]+$/);
    const folder = folderMatch ? folderMatch[1] : 'formation';
    const vaultPath = existingDoc.s3Key.replace(/\/[^\/]+\/[^\/]+$/, '');

    const uploadResult = await uploadDocument(
      vaultPath,
      folder,
      signedFileName,
      buffer,
      file.type || 'application/pdf'
    );

    const now = new Date().toISOString();
    const updatedDocuments = documents.map(doc => {
      if (doc.id !== documentId) return doc;
      return {
        ...doc,
        signedS3Key: uploadResult.s3Key,
        status: 'signed' as const,
        signedAt: now,
      };
    });

    await saveUserCompanyDocuments(customerEmail, recordId, updatedDocuments);

    // Update Airtable for tax forms if needed
    let airtableField: string | null = null;
    if (documentId === 'ss4-ein-application') {
      airtableField = 'SS-4 URL';
    } else if (documentId === 'form-2848-power-of-attorney') {
      airtableField = '2848 URL';
    } else if (documentId === 'form-8821-tax-authorization') {
      airtableField = '8821 URL';
    }
    if (airtableField) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
      const signedUrl = `${baseUrl}/api/documents/view?key=${encodeURIComponent(uploadResult.s3Key)}`;
      await updateFormationRecord(recordId, {
        [airtableField]: signedUrl,
      } as any);
    }

    const updatedDoc = updatedDocuments.find(d => d.id === documentId);

    return NextResponse.json({
      success: true,
      document: updatedDoc,
    });
  } catch (error: any) {
    console.error('❌ Admin upload-signed-document error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload signed document' },
      { status: 500 }
    );
  }
}
