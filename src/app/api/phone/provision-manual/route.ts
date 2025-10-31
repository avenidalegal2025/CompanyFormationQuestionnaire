import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveBusinessPhone } from '@/lib/dynamo';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { formationState, forwardToE164 } = await req.json();
    if (!formationState || !forwardToE164) {
      return NextResponse.json({ 
        error: 'formationState and forwardToE164 are required' 
      }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: 'Missing NEXT_PUBLIC_BASE_URL' }, { status: 500 });
    }

    // Call the provision endpoint
    const resp = await fetch(`${baseUrl}/api/phone/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formationState, forwardToE164 })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return NextResponse.json({ 
        error: 'Failed to provision phone', 
        details: errorText 
      }, { status: 500 });
    }

    const data = await resp.json();
    console.log('📞 Phone provisioned:', data);

    // Save to DynamoDB
    await saveBusinessPhone(session.user.email, {
      phoneNumber: data.phoneNumber,
      areaCode: data.areaCode,
      sid: data.sid,
      forwardToE164: forwardToE164,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ 
      success: true, 
      phone: data.phoneNumber,
      areaCode: data.areaCode 
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manual provision error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

