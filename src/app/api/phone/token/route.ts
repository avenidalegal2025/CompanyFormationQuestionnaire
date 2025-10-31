import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBusinessPhone } from '@/lib/dynamo';
import twilio from 'twilio';

const ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const API_KEY_SID = (process.env.TWILIO_API_KEY_SID || '').trim();
const API_KEY_SECRET = (process.env.TWILIO_API_KEY_SECRET || '').trim();

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business phone
    const businessPhone = await getBusinessPhone(session.user.email);
    if (!businessPhone?.phoneNumber) {
      return NextResponse.json({ error: 'No business phone assigned' }, { status: 404 });
    }

    if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET) {
      return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 });
    }

    // Create access token
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const token = new AccessToken(
      ACCOUNT_SID,
      API_KEY_SID,
      API_KEY_SECRET,
      { identity: session.user.email, ttl: 3600 } // 1 hour expiry
    );

    // Grant voice capabilities
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
      incomingAllow: true,
    });

    token.addGrant(voiceGrant);

    return NextResponse.json({
      token: token.toJwt(),
      identity: session.user.email,
      phoneNumber: businessPhone.phoneNumber,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Token generation error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

