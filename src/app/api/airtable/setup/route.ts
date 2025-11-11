import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Setup endpoint to create Airtable table structure
 * 
 * This endpoint provides instructions for setting up the Airtable base.
 * Airtable doesn't allow programmatic table creation via their API,
 * so this must be done manually through their UI.
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if Airtable is configured
    const isConfigured = !!(
      process.env.AIRTABLE_API_KEY &&
      process.env.AIRTABLE_BASE_ID &&
      process.env.AIRTABLE_TABLE_NAME
    );

    return NextResponse.json({
      configured: isConfigured,
      instructions: {
        step1: 'Go to https://airtable.com and create a new base called "Avenida Legal CRM"',
        step2: 'Create a table named "Formations"',
        step3: 'Import the CSV template from: /airtable-formations-template.csv',
        step4: 'Adjust field types as needed (Currency, Date, Email, Phone, URL, etc.)',
        step5: 'Get your Base ID from the URL (starts with "app...")',
        step6: 'Create a Personal Access Token in Developer Hub',
        step7: 'Add AIRTABLE_API_KEY, AIRTABLE_BASE_ID, and AIRTABLE_TABLE_NAME to your environment variables',
      },
      currentConfig: {
        hasApiKey: !!process.env.AIRTABLE_API_KEY,
        hasBaseId: !!process.env.AIRTABLE_BASE_ID,
        tableName: process.env.AIRTABLE_TABLE_NAME || 'Formations',
      },
      fieldCount: 219,
      sampleFields: [
        'Company Name',
        'Entity Type',
        'Formation State',
        'Customer Email',
        'Total Payment Amount',
        'Owner 1 Name',
        'Owner 1 Email',
        'Owner 1 SSN',
        'Director 1 Name',
        'Officer 1 Name',
        'Officer 1 Role',
        'Manager 1 Name',
        'LLC Capital Contributions 1',
        'Corp Capital Per Owner 1',
        'Documents URLs',
      ],
    });
  } catch (error: any) {
    console.error('Airtable setup error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Test endpoint to verify Airtable connection
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { createFormationRecord } = await import('@/lib/airtable');

    // Create a test record
    const testRecord = {
      'Company Name': 'Test Company LLC',
      'Entity Type': 'LLC' as const,
      'Formation State': 'Florida',
      'Formation Status': 'Pending' as const,
      'Customer Email': session.user.email,
      'Customer Name': session.user.name || 'Test User',
      'Total Payment Amount': 1380.00,
      'Products Purchased': 'LLC Formation, Business Address, Business Phone',
      'Payment Date': new Date().toISOString().split('T')[0],
      'Stripe Payment ID': 'test_' + Date.now(),
      'Internal Status': 'New' as const,
    };

    const recordId = await createFormationRecord(testRecord);

    return NextResponse.json({
      success: true,
      message: 'Test record created successfully',
      recordId,
      testRecord,
    });
  } catch (error: any) {
    console.error('Airtable test error:', error);
    return NextResponse.json(
      { 
        error: error.message,
        details: error.statusCode === 404 
          ? 'Table "Formations" not found. Please create it in Airtable first.'
          : 'Failed to create test record. Check your Airtable credentials.',
      },
      { status: 500 }
    );
  }
}

