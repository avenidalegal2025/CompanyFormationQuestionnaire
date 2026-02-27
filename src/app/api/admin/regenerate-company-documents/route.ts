import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Airtable from 'airtable';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY?.trim() || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID?.trim() || '';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME?.trim() || 'Formations';

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

const AUTHORIZED_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
  'trimaran.llc+3456464@gmail.com',
];

/**
 * POST /api/admin/regenerate-company-documents
 * Regenerates Membership Registry and Organizational Resolution for a company (so you can verify fixes like date format).
 * Body: { recordId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminEmail = session.user.email.toLowerCase().trim();
    const isAuthorized = AUTHORIZED_EMAILS.some((e) => e.toLowerCase().trim() === adminEmail);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized', email: adminEmail }, { status: 403 });
    }

    const body = await request.json();
    const recordId = (body.recordId || '').trim();
    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const record = await base(AIRTABLE_TABLE_NAME).find(recordId);
    const fields = record.fields as Record<string, unknown>;
    const entityType = (fields['Entity Type'] as string) || 'LLC';
    const companyName = (fields['Company Name'] as string) || 'Company';

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const results: { membershipRegistry?: { success: boolean; error?: string }; organizationalResolution?: { success: boolean; error?: string } } = {};

    const isLLC = entityType === 'LLC' || (entityType || '').toLowerCase().includes('llc');
    const isCorp = (entityType || '').toLowerCase().includes('corp') || (entityType || '').toLowerCase().includes('inc');

    if (isLLC) {
      try {
        const res = await fetch(`${baseUrl}/api/airtable/generate-membership-registry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordId, updateAirtable: true }),
        });
        const data = await res.json().catch(() => ({}));
        results.membershipRegistry = res.ok ? { success: true } : { success: false, error: (data as any).error || res.statusText };
      } catch (err: any) {
        results.membershipRegistry = { success: false, error: err.message };
      }
    }

    if (isLLC || isCorp) {
      try {
        const res = await fetch(`${baseUrl}/api/airtable/generate-organizational-resolution`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordId, updateAirtable: true }),
        });
        const data = await res.json().catch(() => ({}));
        results.organizationalResolution = res.ok ? { success: true } : { success: false, error: (data as any).error || res.statusText };
      } catch (err: any) {
        results.organizationalResolution = { success: false, error: err.message };
      }
    }

    const allOk =
      (results.membershipRegistry?.success ?? true) &&
      (results.organizationalResolution?.success ?? true);

    return NextResponse.json({
      success: allOk,
      companyName,
      entityType,
      results,
    });
  } catch (error: any) {
    console.error('❌ regenerate-company-documents error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to regenerate documents' },
      { status: 500 }
    );
  }
}
