import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_TEST_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TEST_AUTH_TOKEN || '';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || '';

// Simple prestigious area code mapping per state
const STATE_TO_AREACODES: Record<string, number[]> = {
  Florida: [305, 786], // Miami / Miami-Dade
  Delaware: [302],
  Wyoming: [307],
  Texas: [512, 214, 713, 469], // Austin, Dallas, Houston
  Nevada: [702, 725], // Las Vegas
  'New Mexico': [505, 575],
  California: [415, 310, 424], // SF, LA
  Georgia: [404, 470], // Atlanta
  Arizona: [602, 480], // Phoenix, East Valley
};

export async function POST(req: NextRequest) {
  try {
    const { formationState, forwardToE164 } = await req.json();
    if (!formationState || !forwardToE164) {
      return NextResponse.json({ error: 'formationState y forwardToE164 son requeridos' }, { status: 400 });
    }
    if (!ACCOUNT_SID || !AUTH_TOKEN || !BASE_URL) {
      return NextResponse.json({ error: 'Configuración de Twilio/BASE_URL incompleta' }, { status: 500 });
    }

    const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

    const areaCodes = STATE_TO_AREACODES[formationState] || [];
    if (areaCodes.length === 0) {
      return NextResponse.json({ error: `No hay códigos de área configurados para ${formationState}` }, { status: 400 });
    }

    // Find first available number from preferred area codes
    let candidateNumber: string | null = null;
    for (const ac of areaCodes) {
      const list = await client.availablePhoneNumbers('US').local.list({ areaCode: ac, limit: 5, voiceEnabled: true, smsEnabled: true });
      const first = list.find(n => !!n.phoneNumber);
      if (first?.phoneNumber) {
        candidateNumber = first.phoneNumber;
        break;
      }
    }

    if (!candidateNumber) {
      return NextResponse.json({ error: 'No se encontraron números disponibles en los códigos de área preferidos' }, { status: 404 });
    }

    // Configure voice webhook to forward to chosen number; use query param for MVP
    const voiceUrl = `${BASE_URL}/api/phone/voice-webhook?forwardTo=${encodeURIComponent(forwardToE164)}`;

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: candidateNumber,
      voiceUrl,
      voiceMethod: 'POST',
      smsUrl: undefined,
    });

    return NextResponse.json({
      success: true,
      phoneNumber: purchased.phoneNumber,
      sid: purchased.sid,
      formationState,
      areaCode: purchased.phoneNumber ? purchased.phoneNumber.replace('+1', '').slice(0, 3) : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


