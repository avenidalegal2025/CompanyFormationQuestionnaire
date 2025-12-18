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
 * Fetches companies for a user by email, or a single company by ID
 * 
 * Query params:
 * - email: Fetch all companies for this email
 * - companyId: Fetch a single company by Airtable record ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const companyId = searchParams.get('companyId');

    // If companyId is provided, fetch that specific company
    if (companyId) {
      try {
        const record = await base(AIRTABLE_TABLE_NAME).find(companyId);
        const fields = record.fields;
        
        const company: Company = {
          id: record.id,
          companyName: (fields['Company Name'] as string) || 'Unknown Company',
          entityType: (fields['Entity Type'] as string) || 'LLC',
          formationState: (fields['Formation State'] as string) || '',
          formationStatus: (fields['Formation Status'] as string) || 'Pending',
          createdAt: (fields['Payment Date'] as string) || new Date().toISOString(),
          customerEmail: (fields['Customer Email'] as string) || '',
        };
        
        return NextResponse.json({
          success: true,
          company,
        });
      } catch (error: any) {
        console.error('❌ Error fetching company by ID:', error);
        return NextResponse.json(
          {
            error: 'Company not found',
            details: error.message,
          },
          { status: 404 }
        );
      }
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email or companyId parameter is required' },
        { status: 400 }
      );
    }

    // Normalize email: lowercase and trim
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`🔍 Fetching companies for user: ${normalizedEmail} (original: ${email})`);

    const companies: Company[] = [];

    // Query Airtable for all records with matching email (case-insensitive)
    // Airtable formula: LOWER() function to make comparison case-insensitive
    await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `LOWER({Customer Email}) = "${normalizedEmail}"`,
        sort: [{ field: 'Payment Date', direction: 'desc' }], // Most recent first
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const fields = record.fields;
          const recordEmail = (fields['Customer Email'] as string) || '';
          const recordCompanyName = (fields['Company Name'] as string) || 'Unknown Company';
          
          console.log(`📋 Found company: ${recordCompanyName} (email: ${recordEmail})`);
          
          companies.push({
            id: record.id,
            companyName: recordCompanyName,
            entityType: (fields['Entity Type'] as string) || 'LLC',
            formationState: (fields['Formation State'] as string) || '',
            formationStatus: (fields['Formation Status'] as string) || 'Pending',
            createdAt: (fields['Payment Date'] as string) || new Date().toISOString(),
            customerEmail: recordEmail || normalizedEmail,
          });
        });
        fetchNextPage();
      });

    console.log(`✅ Found ${companies.length} companies for user: ${normalizedEmail}`);
    
    // If no companies found, log a warning with all available emails for debugging
    if (companies.length === 0) {
      console.warn(`⚠️ No companies found for email: ${normalizedEmail}`);
      console.warn(`💡 This could mean:`);
      console.warn(`   1. The company record hasn't been created in Airtable yet (check webhook logs)`);
      console.warn(`   2. The email in Airtable doesn't match: ${normalizedEmail}`);
      console.warn(`   3. The webhook may have failed to create the record`);
    }

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

