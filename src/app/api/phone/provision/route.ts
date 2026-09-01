import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { requireInternalAuth, internalAuthHeaders } from '@/lib/internal-auth';

const ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_TEST_ACCOUNT_SID || '').trim();
const AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TEST_AUTH_TOKEN || '').trim();
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || '').trim();

// Simple prestigious area code mapping per state (tried first, in order)
const STATE_TO_AREACODES: Record<string, number[]> = {
  Florida: [305, 786, 954, 561, 407, 813], // Miami first, then Ft Lauderdale/Palm Beach/Orlando/Tampa
  Delaware: [302],
  Wyoming: [307],
  Texas: [512, 214, 713, 469], // Austin, Dallas, Houston
  Nevada: [702, 725], // Las Vegas
  'New Mexico': [505, 575],
  California: [415, 310, 424], // SF, LA
  Georgia: [404, 470], // Atlanta
  Arizona: [602, 480], // Phoenix, East Valley
};

// USPS region code per state, for the state-wide fallback search when the
// preferred area codes have no inventory (Twilio's pool fluctuates — e.g. Miami
// 305/786 can be fully dry, which previously made provisioning 404 and leave the
// customer with no number).
const STATE_TO_REGION: Record<string, string> = {
  Florida: 'FL',
  Delaware: 'DE',
  Wyoming: 'WY',
  Texas: 'TX',
  Nevada: 'NV',
  'New Mexico': 'NM',
  California: 'CA',
  Georgia: 'GA',
  Arizona: 'AZ',
};

export async function POST(req: NextRequest) {
  // This route buys a Twilio number, i.e. it spends money on every call, and
  // it had no inbound auth at all. Both real callers are server-side (the
  // Stripe webhook post-payment, and /api/phone/provision-manual, which does
  // its own session check first), so the shared internal key is the right
  // credential here rather than a user session.
  const deny = await requireInternalAuth(req);
  if (deny) return deny;
  try {
    const { formationState, forwardToE164 } = await req.json();
    // forwardToE164 is OPTIONAL: a number must always be provisioned (the SS-4 /
    // 8821 forms need *a* business number); call forwarding is a secondary
    // convenience that can be configured later. Previously a missing forward
    // target returned 400 and no number was ever bought.
    if (!formationState) {
      return NextResponse.json({ error: 'formationState es requerido' }, { status: 400 });
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

    // Fallback: if every preferred area code is dry, take ANY number in the
    // formation state's region so the customer still gets a local number.
    if (!candidateNumber) {
      const region = STATE_TO_REGION[formationState];
      if (region) {
        const list = await client.availablePhoneNumbers('US').local.list({ inRegion: region, limit: 5, voiceEnabled: true, smsEnabled: true });
        const first = list.find(n => !!n.phoneNumber);
        if (first?.phoneNumber) {
          candidateNumber = first.phoneNumber;
          console.log(`📞 Preferred area codes dry for ${formationState}; fell back to region ${region}: ${candidateNumber}`);
        }
      }
    }

    if (!candidateNumber) {
      return NextResponse.json({ error: 'No se encontraron números disponibles en los códigos de área preferidos' }, { status: 404 });
    }

    // Configure voice webhook to forward to chosen number; use query param for MVP.
    // When no forward target is supplied, still point at the voice webhook (it
    // returns valid TwiML without a forwardTo) so the number is fully usable.
    const voiceUrl = forwardToE164
      ? `${BASE_URL}/api/phone/voice-webhook?forwardTo=${encodeURIComponent(forwardToE164)}`
      : `${BASE_URL}/api/phone/voice-webhook`;

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


