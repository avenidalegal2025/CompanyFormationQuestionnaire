import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Airtable from 'airtable';
import { getUserDocuments, saveUserDocuments, getVaultMetadata } from '@/lib/dynamo';
import { uploadDocument } from '@/lib/s3-vault';
import { updateFormationRecord } from '@/lib/airtable';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.warn('⚠️ Airtable credentials not configured for admin upload-company-doc');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Same authorized emails as screenshots admin
const AUTHORIZED_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

type DocType = 'ein' | 'articles_inc' | 'articles_llc';

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
    const docType = formData.get('docType') as DocType | null;
    const file = formData.get('file') as File | null;

    if (!recordId || !docType || !file) {
      return NextResponse.json(
        { error: 'Missing recordId, docType, or file' },
        { status: 400 }
      );
    }

    // Fetch Airtable record to get customer email and vault path
    const record = await base(AIRTABLE_TABLE_NAME).find(recordId);
    const fields = record.fields;

    const customerEmail = ((fields['Customer Email'] as string) || '').toLowerCase().trim();
    const vaultPathField = (fields['Vault Path'] as string) || '';
    const entityType = (fields['Entity Type'] as string) || 'LLC';

    if (!customerEmail) {
      return NextResponse.json(
        { error: 'Airtable record is missing Customer Email' },
        { status: 400 }
      );
    }

    // Determine vaultPath: prefer Airtable 'Vault Path', fallback to Dynamo metadata
    let vaultPath = vaultPathField;
    if (!vaultPath) {
      const vaultMetadata = await getVaultMetadata(customerEmail);
      if (!vaultMetadata?.vaultPath) {
        return NextResponse.json(
          { error: 'Vault path not found for company' },
          { status: 404 }
        );
      }
      vaultPath = vaultMetadata.vaultPath;
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Map docType to document metadata
    let documentId: string;
    let documentName: string;
    let fileName: string;
    let airtableField: string | null = null;

    if (docType === 'ein') {
      documentId = 'ein-letter';
      documentName = 'EIN Confirmation Letter';
      fileName = 'ein-letter.pdf';
      // Optional: add an Airtable field later if desired
    } else if (docType === 'articles_inc') {
      documentId = 'articles-inc';
      documentName = 'Articles of Incorporation';
      fileName = 'articles-of-incorporation.pdf';
      airtableField = 'Articles of incorporation Inc URL';
    } else if (docType === 'articles_llc') {
      documentId = 'articles-llc';
      documentName = 'Articles of Organization';
      fileName = 'articles-of-organization.pdf';
      airtableField = 'Articles of organization LLC URL';
    } else {
      return NextResponse.json(
        { error: 'Invalid docType' },
        { status: 400 }
      );
    }

    // Basic validation for entity type vs docType
    const entityTypeLower = entityType.toLowerCase();
    const isCorp = entityTypeLower.includes('corp') || entityTypeLower.includes('inc');
    const isLlc = entityTypeLower.includes('llc');

    if (docType === 'articles_inc' && !isCorp) {
      return NextResponse.json(
        { error: 'Articles of Incorporation only apply to corporations' },
        { status: 400 }
      );
    }

    if (docType === 'articles_llc' && !isLlc) {
      return NextResponse.json(
        { error: 'Articles of Organization only apply to LLCs' },
        { status: 400 }
      );
    }

    // Upload PDF to S3 in formation folder
    const uploadResult = await uploadDocument(
      vaultPath,
      'formation',
      fileName,
      buffer,
      file.type || 'application/pdf'
    );

    console.log(`✅ Admin uploaded ${docType} document to: ${uploadResult.s3Key}`);

    // Update DynamoDB documents for the customer
    const existingDocuments = await getUserDocuments(customerEmail);
    const now = new Date().toISOString();

    const updatedDocuments = (() => {
      const docs = existingDocuments || [];
      const index = docs.findIndex(d => d.id === documentId);
      const baseDoc = {
        id: documentId,
        name: documentName,
        type: 'formation' as const,
        s3Key: uploadResult.s3Key,
        status: 'generated' as const,
        createdAt: now,
        size: uploadResult.size,
      };

      if (index >= 0) {
        docs[index] = {
          ...docs[index],
          ...baseDoc,
        };
      } else {
        docs.push(baseDoc);
      }

      return docs;
    })();

    await saveUserDocuments(customerEmail, updatedDocuments);

    // Update Airtable with URL for Articles fields if applicable
    if (airtableField) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-formation-questionnaire.vercel.app';
        const viewUrl = `${baseUrl}/api/documents/view?key=${encodeURIComponent(uploadResult.s3Key)}`;

        await updateFormationRecord(recordId, {
          [airtableField]: viewUrl,
        } as any);

        console.log(`✅ Updated Airtable field ${airtableField} for record ${recordId}`);
      } catch (airtableError: any) {
        console.error('❌ Failed to update Airtable with Articles URL:', airtableError.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Document uploaded successfully',
      documentId,
      s3Key: uploadResult.s3Key,
    });
  } catch (error: any) {
    console.error('❌ Admin upload-company-doc error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload document' },
      { status: 500 }
    );
  }
}


