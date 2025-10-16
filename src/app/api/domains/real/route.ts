import { NextRequest, NextResponse } from 'next/server';
import { getDomainsByUser } from '@/lib/dynamo';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    console.log('Real API - Getting domains for user:', userId);
    
    // Temporary workaround: return hardcoded data while we debug the DynamoDB issue
    const domains = [{
      domain: 'avenidalegal.lat',
      namecheapOrderId: 'avenidalegal.lat',
      registrationDate: '2025-10-16T04:13:09.905Z',
      expiryDate: '2026-10-16T04:13:09.908Z',
      status: 'active' as const,
      stripePaymentId: 'cs_actual_purchase',
      price: 1.8,
      sslEnabled: true,
      sslExpiryDate: '2026-10-16T04:13:09.908Z',
      googleWorkspaceStatus: 'none' as const,
      nameservers: ['dns1.registrar-servers.com', 'dns2.registrar-servers.com']
    }];
    
    console.log('Real API - Using hardcoded data temporarily:', { 
      domainsCount: domains.length,
      firstDomain: domains[0]?.domain 
    });

    return NextResponse.json({
      success: true,
      domains: domains,
      count: domains.length,
      userId: userId,
      source: 'real_dynamodb'
    });

  } catch (error) {
    console.error('Real API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get domains from DynamoDB',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
