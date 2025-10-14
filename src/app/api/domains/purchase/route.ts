import { NextRequest, NextResponse } from 'next/server';

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token';

export async function POST(request: NextRequest) {
  try {
    const { 
      domain, 
      years = 1, 
      customerInfo,
      paymentInfo 
    } = await request.json();

    if (!domain || !customerInfo) {
      return NextResponse.json(
        { error: 'Domain and customer information are required' },
        { status: 400 }
      );
    }

    // Call Namecheap proxy to purchase domain
    const response = await fetch(`${NAMECHEAP_PROXY_URL}/domains/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': PROXY_TOKEN,
      },
      body: JSON.stringify({
        domain,
        years,
        customerInfo,
        paymentInfo
      }),
    });

    if (!response.ok) {
      throw new Error(`Namecheap API error: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      domain,
      orderId: data.orderId,
      price: data.price,
      status: data.status,
      message: data.message || 'Domain purchase initiated successfully'
    });

  } catch (error) {
    console.error('Domain purchase error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to purchase domain',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
