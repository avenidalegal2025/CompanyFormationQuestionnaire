import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getBusinessPhone } from '@/lib/dynamo';

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(req: NextRequest) {
  try {
    // Try to get parameters from both URL params and form data
    const { searchParams } = new URL(req.url);
    let to = searchParams.get('To');
    
    // If not in URL params, try form data
    if (!to) {
      const formData = await req.formData();
      to = formData.get('To') as string;
      console.log('All form params:', Object.fromEntries(formData.entries()));
    }
    
    console.log('Outbound call request - To:', to);
    console.log('URL:', req.url);

    if (!to) {
      console.error('Missing To parameter in both URL and form data');
      const twiml = new VoiceResponse();
      twiml.say({ language: 'es-MX' }, 'Error: número de destino no especificado.');
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
    twiml.say({ language: 'es-MX' }, 'Lo sentimos, hubo un error al realizar la llamada.');
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}

