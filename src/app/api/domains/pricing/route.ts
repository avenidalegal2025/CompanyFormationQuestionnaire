import { NextRequest, NextResponse } from 'next/server';

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token';

export async function POST(request: NextRequest) {
  try {
    const { domains } = await request.json();

    if (!domains || !Array.isArray(domains)) {
      return NextResponse.json(
        { error: 'Domains array is required' },
        { status: 400 }
      );
    }

    // Call Namecheap proxy to get domain pricing
    const response = await fetch(`${NAMECHEAP_PROXY_URL}/domains/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': PROXY_TOKEN,
      },
      body: JSON.stringify({ domains }),
    });

    if (!response.ok) {
      throw new Error(`Namecheap API error: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      pricing: data.pricing || []
    });

  } catch (error) {
    console.error('Domain pricing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get domain pricing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
