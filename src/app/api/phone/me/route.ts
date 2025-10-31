import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBusinessPhone, saveBusinessPhone } from '@/lib/dynamo';
import twilio from 'twilio';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_TEST_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TEST_AUTH_TOKEN || '';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || '';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rec = await getBusinessPhone(session.user.email);
  return NextResponse.json({ phone: rec || null });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { forwardToE164 } = await req.json();
    if (!forwardToE164) return NextResponse.json({ error: 'forwardToE164 is required' }, { status: 400 });
    const current = await getBusinessPhone(session.user.email);
    if (!current?.sid || !current?.phoneNumber) {
      return NextResponse.json({ error: 'No business phone assigned yet' }, { status: 400 });
    }
    if (!ACCOUNT_SID || !AUTH_TOKEN || !BASE_URL) {
      return NextResponse.json({ error: 'Twilio/BASE_URL not configured' }, { status: 500 });
    }
    const client = twilio(ACCOUNT_SID, AUTH_TOKEN);
    const voiceUrl = `${BASE_URL}/api/phone/voice-webhook?forwardTo=${encodeURIComponent(forwardToE164)}`;
    await client.incomingPhoneNumbers(current.sid).update({ voiceUrl, voiceMethod: 'POST' });
    await saveBusinessPhone(session.user.email, {
      ...current,
      forwardToE164,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


