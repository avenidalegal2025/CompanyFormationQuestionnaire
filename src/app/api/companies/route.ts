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
    // IMPORTANT: No maxRecords limit - fetch ALL companies for this user
    // Also try without sort first to see if sorting is causing issues
    try {
      await base(AIRTABLE_TABLE_NAME)
        .select({
          filterByFormula: `LOWER({Customer Email}) = "${normalizedEmail}"`,
          // Sort by Payment Date descending, then by record ID (newer records have later IDs)
          sort: [{ field: 'Payment Date', direction: 'desc' }],
          // No maxRecords - fetch all pages
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach((record) => {
            const fields = record.fields;
            const recordEmail = (fields['Customer Email'] as string) || '';
            const recordCompanyName = (fields['Company Name'] as string) || 'Unknown Company';

            // Prefer Airtable's internal createdTime (full timestamp) for precise ordering.
            // This property exists at runtime but isn't in the TS types, so we access it via `any`.
            const rawRecord: any = record as any;
            const createdTimeFromRecord: string | undefined =
              rawRecord?.createdTime || rawRecord?._rawJson?.createdTime;
            const paymentDate: string | undefined = fields['Payment Date'] as string | undefined;
            const createdAt =
              createdTimeFromRecord ||
              (paymentDate ? `${paymentDate}T00:00:00.000Z` : new Date().toISOString());
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/companies/route.ts:103',message:'Company record fetched',data:{companyName:recordCompanyName,recordId:record.id,createdAt,createdTimeFromRecord,paymentDate},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            
            console.log(`📋 Found company: ${recordCompanyName} (ID: ${record.id}, email: ${recordEmail}, createdAt: ${createdAt}, paymentDate: ${paymentDate || 'NONE'})`);
            
            companies.push({
              id: record.id,
              companyName: recordCompanyName,
              entityType: (fields['Entity Type'] as string) || 'LLC',
              formationState: (fields['Formation State'] as string) || '',
              formationStatus: (fields['Formation Status'] as string) || 'Pending',
              createdAt,
              customerEmail: recordEmail || normalizedEmail,
            });
          });
          fetchNextPage();
        });
    } catch (error: any) {
      console.error('❌ Error in Airtable query:', error);
      // If sorting by Payment Date fails (e.g., some records don't have it), try without sort
      if (error.message?.includes('Payment Date') || error.message?.includes('sort')) {
        console.log('⚠️ Retrying without Payment Date sort...');
        await base(AIRTABLE_TABLE_NAME)
          .select({
            filterByFormula: `LOWER({Customer Email}) = "${normalizedEmail}"`,
            // No sort - just get all records
          })
          .eachPage((records, fetchNextPage) => {
            records.forEach((record) => {
              const fields = record.fields;
              const recordEmail = (fields['Customer Email'] as string) || '';
              const recordCompanyName = (fields['Company Name'] as string) || 'Unknown Company';
              const rawRecord: any = record as any;
              const createdTimeFromRecord: string | undefined =
                rawRecord?.createdTime || rawRecord?._rawJson?.createdTime;
              const paymentDate: string | undefined = fields['Payment Date'] as string | undefined;
              const createdAt =
                createdTimeFromRecord ||
                (paymentDate ? `${paymentDate}T00:00:00.000Z` : new Date().toISOString());
              
              console.log(`📋 Found company (no sort): ${recordCompanyName} (ID: ${record.id}, email: ${recordEmail}, createdAt: ${createdAt})`);
              
              companies.push({
                id: record.id,
                companyName: recordCompanyName,
                entityType: (fields['Entity Type'] as string) || 'LLC',
                formationState: (fields['Formation State'] as string) || '',
                formationStatus: (fields['Formation Status'] as string) || 'Pending',
                createdAt,
                customerEmail: recordEmail || normalizedEmail,
              });
            });
            fetchNextPage();
          });
      } else {
        throw error;
      }
    }

    // GLOBAL SORT: Regardless of whether we hit the normal or fallback path,
    // sort by createdAt (full timestamp) descending, with record ID as tiebreaker.
    if (companies.length > 1) {
      companies.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        if (dateB !== dateA) {
          return dateB - dateA; // Descending by date
        }
        // If dates are equal, use record ID as tiebreaker (newer IDs come later alphabetically)
        return b.id.localeCompare(a.id);
      });

      // #region agent log
      const newestCompanyData = companies[0]
        ? {
            id: companies[0].id,
            name: companies[0].companyName,
            createdAt: companies[0].createdAt,
            createdAtMs: new Date(companies[0].createdAt).getTime(),
          }
        : null;
      const allCompaniesData = companies.slice(0, 10).map((c: Company) => ({
        id: c.id,
        name: c.companyName,
        createdAt: c.createdAt,
        createdAtMs: new Date(c.createdAt).getTime(),
      }));
      fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'api/companies/route.ts:180',
          message: 'Companies sorted (global)',
          data: {
            count: companies.length,
            newestCompany: newestCompanyData,
            allCompanies: allCompaniesData,
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'H',
        }),
      }).catch(() => {});
      // #endregion
    }
    
    // #region agent log
    // Log the companies array with dates for debugging
    console.log('🔍 DEBUG: Companies array after fetch:', JSON.stringify(companies.map(c => ({ id: c.id, name: c.companyName, createdAt: c.createdAt, createdAtMs: new Date(c.createdAt).getTime() })), null, 2));
    // #endregion

    console.log(`✅ Found ${companies.length} companies for user: ${normalizedEmail}`);
    
    // If no companies found, try a more lenient search and log all emails for debugging
    if (companies.length === 0) {
      console.warn(`⚠️ No companies found for email: ${normalizedEmail}`);
      console.warn(`💡 Trying alternative search methods...`);
      
      // Try searching without LOWER() in case of formula issues
      try {
        const altCompanies: Company[] = [];
        await base(AIRTABLE_TABLE_NAME)
          .select({
            filterByFormula: `{Customer Email} = "${normalizedEmail}"`,
          })
          .eachPage((records, fetchNextPage) => {
            records.forEach((record) => {
              const fields = record.fields;
              const paymentDate = (fields['Payment Date'] as string) || new Date().toISOString();
              altCompanies.push({
                id: record.id,
                companyName: (fields['Company Name'] as string) || 'Unknown Company',
                entityType: (fields['Entity Type'] as string) || 'LLC',
                formationState: (fields['Formation State'] as string) || '',
                formationStatus: (fields['Formation Status'] as string) || 'Pending',
                createdAt: paymentDate,
                customerEmail: (fields['Customer Email'] as string) || normalizedEmail,
              });
            });
            fetchNextPage();
          });
        
        if (altCompanies.length > 0) {
          console.log(`✅ Found ${altCompanies.length} companies with alternative search`);
          companies.push(...altCompanies);
        }
      } catch (altError) {
        console.error('❌ Alternative search also failed:', altError);
      }
      
      // Log a sample of all records to help debug email matching
      try {
        console.log(`🔍 Fetching sample records to check email formats...`);
        const sampleRecords: any[] = [];
        await base(AIRTABLE_TABLE_NAME)
          .select({
            maxRecords: 10,
            sort: [{ field: 'Payment Date', direction: 'desc' }],
          })
          .eachPage((records, fetchNextPage) => {
            records.forEach((record) => {
              const fields = record.fields;
              sampleRecords.push({
                id: record.id,
                companyName: fields['Company Name'],
                customerEmail: fields['Customer Email'],
                emailLower: (fields['Customer Email'] as string)?.toLowerCase(),
              });
            });
            fetchNextPage();
          });
        console.log(`📋 Sample records (first 10):`, JSON.stringify(sampleRecords, null, 2));
        console.log(`🔍 Looking for email: "${normalizedEmail}"`);
      } catch (sampleError) {
        console.error('❌ Could not fetch sample records:', sampleError);
      }
      
      console.warn(`💡 Possible issues:`);
      console.warn(`   1. The company record hasn't been created in Airtable yet (check webhook logs)`);
      console.warn(`   2. The email in Airtable doesn't match: ${normalizedEmail}`);
      console.warn(`   3. The webhook may have failed to create the record`);
      console.warn(`   4. There may be whitespace or formatting differences in the email field`);
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

