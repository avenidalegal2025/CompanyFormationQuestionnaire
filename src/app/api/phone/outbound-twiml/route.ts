import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getBusinessPhone } from '@/lib/dynamo';

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const to = formData.get('To') as string;
    const from = formData.get('From') as string;
    
    // Get the user's identity from the call (passed by Twilio)
    const identity = formData.get('identity') as string;

    if (!to) {
      return new NextResponse('Missing To parameter', { status: 400 });
    }

    // Get the user's business phone number to use as caller ID
    let callerId = from;
    if (identity) {
      const businessPhone = await getBusinessPhone(identity);
      if (businessPhone?.phoneNumber) {
        callerId = businessPhone.phoneNumber;
      }
    }

    // Create TwiML response to dial the number
    const twiml = new VoiceResponse();
    
    const dial = twiml.dial({
      callerId: callerId,
      answerOnBridge: true,
    });
    
    dial.number(to);

    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (err) {
    console.error('Outbound TwiML error:', err);
    const twiml = new VoiceResponse();
    twiml.say('Lo sentimos, hubo un error al realizar la llamada.');
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}

