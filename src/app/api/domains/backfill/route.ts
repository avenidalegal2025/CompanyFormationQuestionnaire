import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveDomainRegistration, type DomainRegistration } from '@/lib/dynamo';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const userId: string = body.userId || session.user.email;
    const domain: string = body.domain;
    const price: number = Number(body.price ?? 0);

    if (!domain) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const domainData: DomainRegistration = {
      domain,
      namecheapOrderId: domain,
      registrationDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString(),
      status: 'active',
      stripePaymentId: body.stripePaymentId || 'backfill',
      price,
      sslEnabled: false,
      googleWorkspaceStatus: 'none',
      nameservers: ['dns1.registrar-servers.com','dns2.registrar-servers.com']
    };

    await saveDomainRegistration(userId, domainData);
    return NextResponse.json({ success: true, userId, domain: domainData });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 200 });
  }
}


