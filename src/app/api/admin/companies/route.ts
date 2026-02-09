import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Airtable from 'airtable';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.warn('⚠️ Airtable credentials not configured for admin companies search');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Same authorized emails as screenshots admin
const AUTHORIZED_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

interface AdminCompany {
  id: string;
  companyName: string;
  entityType: string;
  formationState: string;
  formationStatus: string;
  paymentDate: string;
  customerEmail: string;
  vaultPath?: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = session.user.email.toLowerCase().trim();
    const isAuthorized = AUTHORIZED_EMAILS.some(email => email.toLowerCase().trim() === userEmail);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized', email: userEmail }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('query') || '').trim();
    const latestParam = searchParams.get('latest');
    const latest = latestParam ? Math.min(Math.max(1, parseInt(latestParam, 10)), 50) : 0;

    const companies: AdminCompany[] = [];

    if (query) {
      // Search by Company Name or Customer Email (case-insensitive)
      const normalizedQuery = query.toLowerCase();
      await base(AIRTABLE_TABLE_NAME)
        .select({
          filterByFormula: `OR(FIND("${normalizedQuery}", LOWER({Company Name})), FIND("${normalizedQuery}", LOWER({Customer Email})))`,
          sort: [{ field: 'Payment Date', direction: 'desc' }],
          maxRecords: 50,
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach((record) => {
            const fields = record.fields;
            companies.push({
              id: record.id,
              companyName: (fields['Company Name'] as string) || 'Unknown Company',
              entityType: (fields['Entity Type'] as string) || 'LLC',
              formationState: (fields['Formation State'] as string) || '',
              formationStatus: (fields['Formation Status'] as string) || 'Pending',
              paymentDate: (fields['Payment Date'] as string) || '',
              customerEmail: ((fields['Customer Email'] as string) || '').toLowerCase().trim(),
              vaultPath: (fields['Vault Path'] as string) || undefined,
            });
          });
          fetchNextPage();
        });
    } else if (latest > 0) {
      // Return latest N companies (by Payment Date desc) for admin quick access
      await base(AIRTABLE_TABLE_NAME)
        .select({
          sort: [{ field: 'Payment Date', direction: 'desc' }],
          maxRecords: latest,
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach((record) => {
            const fields = record.fields;
            companies.push({
              id: record.id,
              companyName: (fields['Company Name'] as string) || 'Unknown Company',
              entityType: (fields['Entity Type'] as string) || 'LLC',
              formationState: (fields['Formation State'] as string) || '',
              formationStatus: (fields['Formation Status'] as string) || 'Pending',
              paymentDate: (fields['Payment Date'] as string) || '',
              customerEmail: ((fields['Customer Email'] as string) || '').toLowerCase().trim(),
              vaultPath: (fields['Vault Path'] as string) || undefined,
            });
          });
          fetchNextPage();
        });
    } else {
      return NextResponse.json(
        { error: 'Missing query or latest parameter' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      companies,
      count: companies.length,
    });
  } catch (error: any) {
    console.error('❌ Error searching companies for admin:', error.message);
    return NextResponse.json(
      { error: 'Failed to search companies', details: error.message },
      { status: 500 }
    );
  }
}


