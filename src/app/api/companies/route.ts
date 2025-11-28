import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.warn('⚠️ Airtable credentials not configured');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

interface Company {
  id: string;
  companyName: string;
  entityType: string;
  formationState: string;
  formationStatus: string;
  createdAt: string;
  customerEmail: string;
}

/**
 * GET /api/companies
 * Fetches all companies for a user by email
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Fetching companies for user: ${email}`);

    const companies: Company[] = [];

    // Query Airtable for all records with matching email
    await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `{Customer Email} = "${email}"`,
        sort: [{ field: 'Payment Date', direction: 'desc' }], // Most recent first
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
            createdAt: (fields['Payment Date'] as string) || new Date().toISOString(),
            customerEmail: (fields['Customer Email'] as string) || email,
          });
        });
        fetchNextPage();
      });

    console.log(`✅ Found ${companies.length} companies for user: ${email}`);

    return NextResponse.json({
      success: true,
      companies,
      count: companies.length,
    });
  } catch (error: any) {
    console.error('❌ Error fetching companies:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch companies',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

