import { NextRequest, NextResponse } from 'next/server';

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing Namecheap proxy connection...');
    console.log('Proxy URL:', NAMECHEAP_PROXY_URL);
    console.log('Token configured:', !!PROXY_TOKEN);

    // Test basic connectivity
    const response = await fetch(`${NAMECHEAP_PROXY_URL}/`, {
      method: 'GET',
      headers: {
        'x-proxy-token': PROXY_TOKEN,
      },
    });

    if (!response.ok) {
      throw new Error(`Proxy health check failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Namecheap proxy connection successful',
      proxyUrl: NAMECHEAP_PROXY_URL,
      tokenConfigured: !!PROXY_TOKEN,
      response: data
    });

  } catch (error) {
    console.error('Namecheap proxy test error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to connect to Namecheap proxy',
        details: error instanceof Error ? error.message : 'Unknown error',
        proxyUrl: NAMECHEAP_PROXY_URL,
        tokenConfigured: !!PROXY_TOKEN
      },
      { status: 500 }
    );
  }
}
