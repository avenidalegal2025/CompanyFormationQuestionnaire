import { NextRequest, NextResponse } from 'next/server';

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
// No fallback: a literal default here is public in this repo and would be a
// working credential on the Namecheap proxy. Missing config must fail, not
// silently authenticate with a known-public token.
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN;

function proxyToken(): string {
  if (!PROXY_TOKEN) {
    throw new Error('NAMECHEAP_PROXY_TOKEN is not configured');
  }
  return PROXY_TOKEN;
}

export async function POST(request: NextRequest) {
  try {
    const { domains } = await request.json();

    if (!domains || !Array.isArray(domains)) {
      return NextResponse.json(
        { error: 'Domains array is required' },
        { status: 400 }
      );
    }

    // Call Namecheap proxy to check domain availability
    const response = await fetch(`${NAMECHEAP_PROXY_URL}/domains/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': proxyToken(),
      },
      body: JSON.stringify({ domains }),
    });

    if (!response.ok) {
      throw new Error(`Namecheap API error: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      results: data.results || []
    });

  } catch (error) {
    console.error('Domain check error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check domain availability',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
