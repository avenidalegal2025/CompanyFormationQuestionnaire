import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  // Build TwiML that forwards the call to the provided number and sets callerId to the business number
  const url = new URL(req.url);
  const forwardTo = url.searchParams.get('forwardTo');
  const formData = await req.formData().catch(() => new FormData());
  const toNumber = (forwardTo || '').toString();
  const businessNumber = (formData.get('To') || '').toString(); // The Twilio number receiving the call

  // Basic validation
  const safeTo = /^\+1\d{10}$/.test(toNumber) ? toNumber : '';
  const callerId = /^\+1\d{10}$/.test(businessNumber) ? businessNumber : undefined;

  const twiml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    safeTo
      ? `<Dial callerId="${callerId ?? ''}"><Number>${safeTo}</Number></Dial>`
      : '<Say language="es-MX">No se pudo completar el desvío de llamadas.</Say>',
    '</Response>'
  ].join('');

  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function GET(req: NextRequest) {
  // Twilio can call GET during testing; respond similarly
  return POST(req);
}


