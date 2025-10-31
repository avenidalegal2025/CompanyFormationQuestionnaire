import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getBusinessPhone } from '@/lib/dynamo';

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(req: NextRequest) {
  try {
    // Parse the request body as form data
    const formData = await req.formData();
    
    // Log ALL parameters Twilio sends
    const allParams: Record<string, any> = {};
    formData.forEach((value, key) => {
      allParams[key] = value;
    });
    console.log('All Twilio parameters:', JSON.stringify(allParams, null, 2));
    
    // Try different possible parameter names
    let to = formData.get('To') as string || 
             formData.get('to') as string ||
             formData.get('Called') as string;
    
    // Also check URL params
    const { searchParams } = new URL(req.url);
    if (!to) {
      to = searchParams.get('To') || searchParams.get('to') || '';
    }
    
    console.log('Extracted To parameter:', to);

    if (!to) {
      console.error('Missing To parameter. Available params:', Object.keys(allParams));
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

    console.log('Generated TwiML for number:', to);

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

