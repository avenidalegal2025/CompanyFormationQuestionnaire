import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Airtable from 'airtable';
import { getUserCompanyDocuments } from '@/lib/dynamo';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

const AUTHORIZED_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const recordId = (searchParams.get('recordId') || '').trim();
    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const record = await base(AIRTABLE_TABLE_NAME).find(recordId);
    const fields = record.fields;
    const customerEmail = ((fields['Customer Email'] as string) || '').toLowerCase().trim();
    if (!customerEmail) {
      return NextResponse.json({ error: 'Airtable record is missing Customer Email' }, { status: 400 });
    }

    const documents = await getUserCompanyDocuments(customerEmail, recordId);

    return NextResponse.json({
      success: true,
      company: {
        id: record.id,
        companyName: (fields['Company Name'] as string) || 'Unknown Company',
        entityType: (fields['Entity Type'] as string) || 'LLC',
        formationState: (fields['Formation State'] as string) || '',
        customerEmail,
      },
      documents,
    });
  } catch (error: any) {
    console.error('❌ Admin company-documents error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch company documents', details: error.message },
      { status: 500 }
    );
  }
}
