import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token-12345';

export async function POST(request: NextRequest) {
  try {
    // Get user session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { domain, dnsRecords } = await request.json();

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    if (!dnsRecords || !Array.isArray(dnsRecords)) {
      return NextResponse.json({ error: 'DNS records are required' }, { status: 400 });
    }

    console.log(`Configuring DNS for domain: ${domain}`);
    console.log('DNS records to configure:', dnsRecords);

    // Parse domain into SLD and TLD for Namecheap API
    const domainParts = domain.split('.');
    const sld = domainParts[0];
    const tld = domainParts.slice(1).join('.');
    
    console.log(`Domain parsed - SLD: ${sld}, TLD: ${tld}`);

    // Call the Lightsail proxy to configure DNS
    const response = await fetch(`${NAMECHEAP_PROXY_URL}/domains/configure-dns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': PROXY_TOKEN,
      },
      body: JSON.stringify({
        domain: domain,
        sld: sld,
        tld: tld,
        records: dnsRecords
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DNS configuration failed:', response.status, errorText);
      return NextResponse.json(
        { 
          error: 'DNS configuration failed',
          details: `Proxy error: ${response.status} ${errorText}`
        },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log('DNS configuration result:', result);

    return NextResponse.json({
      success: true,
      domain: domain,
      recordsConfigured: dnsRecords.length,
      result: result
    });

  } catch (error) {
    console.error('DNS configuration error:', error);
    return NextResponse.json(
      {
        error: 'Failed to configure DNS',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
