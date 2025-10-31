import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getBusinessPhone } from '@/lib/dynamo';

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(req: NextRequest) {
  try {
    // Get parameters from URL search params (sent by Voice SDK)
    const { searchParams } = new URL(req.url);
    const to = searchParams.get('To');
    
    console.log('Outbound call request - To:', to);

    if (!to) {
      console.error('Missing To parameter');
      const twiml = new VoiceResponse();
      twiml.say('Error: número de destino no especificado.');
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Create TwiML response to dial the number
    const twiml = new VoiceResponse();
    
    // Use answerOnBridge to only connect when the call is answered
    const dial = twiml.dial({
      answerOnBridge: true,
      timeout: 30,
    });
    
    dial.number(to);

    console.log('Generated TwiML:', twiml.toString());

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

