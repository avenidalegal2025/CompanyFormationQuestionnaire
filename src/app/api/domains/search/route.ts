import { NextRequest, NextResponse } from 'next/server';

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token-12345';

async function searchDomains(baseDomain: string) {
  if (!baseDomain) {
    throw new Error('Domain name is required');
  }

  const commonExtensions = [
    { ext: 'com', popular: true },
    { ext: 'org', popular: true },
    { ext: 'net', popular: true },
    { ext: 'io', popular: true },
    { ext: 'co', popular: true },
    { ext: 'ai', popular: true },
    { ext: 'lat', popular: false },
    { ext: 'to', popular: false },
    { ext: 'us', popular: false },
    { ext: 'biz', popular: false }
  ];

  const domainsToCheck = commonExtensions.map((ext: any) => `${baseDomain}.${ext.ext}`);

  if (!PROXY_TOKEN) {
    const err: any = new Error('Domain search service not configured');
    err.status = 503;
    err.details = 'NAMECHEAP_PROXY_TOKEN environment variable is required';
    throw err;
  }

  // Availability
  const availabilityResponse = await fetch(`${NAMECHEAP_PROXY_URL}/domains/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-token': PROXY_TOKEN,
    },
    body: JSON.stringify({ domains: domainsToCheck }),
  });
  if (!availabilityResponse.ok) {
    const err: any = new Error(`Namecheap availability API error: ${availabilityResponse.status}`);
    err.status = 502;
    throw err;
  }
  const availabilityData = await availabilityResponse.json();
  const results = availabilityData.results || [];

  // Pricing (no fallback)
  const pricingResponse = await fetch(`${NAMECHEAP_PROXY_URL}/domains/pricing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-token': PROXY_TOKEN,
    },
    body: JSON.stringify({ domains: domainsToCheck }),
  });
  if (!pricingResponse.ok) {
    const err: any = new Error(`Namecheap pricing API error: ${pricingResponse.status}`);
    err.status = 502;
    throw err;
  }
  const pricingResult = await pricingResponse.json();
  if (!pricingResult.success) {
    const err: any = new Error('Invalid pricing data from Namecheap API');
    err.status = 502;
    throw err;
  }

  const pricingData = pricingResult.pricing.reduce((acc: { [key: string]: any }, item: any) => {
    acc[item.domain] = item;
    return acc;
  }, {});

  const enhancedResults = results.map((result: any) => {
    const extension = result.domain.split('.').pop() || '';
    const extInfo = commonExtensions.find((ext: any) => ext.ext === extension) || {
      ext: extension,
      popular: false
    };

    const realPricing = pricingData[result.domain];
    if (!realPricing) {
      const err: any = new Error(`Missing pricing for ${result.domain}`);
      err.status = 502;
      throw err;
    }

    const namecheapPrice = realPricing.price;
    const namecheapRenewalPrice = realPricing.renewal_price || realPricing.price * 1.2;
    const firstYearPrice = namecheapPrice * 1.5;
    const secondYearPrice = namecheapRenewalPrice * 1.5;
    const discount = secondYearPrice > firstYearPrice ? 
      Math.round(((secondYearPrice - firstYearPrice) / secondYearPrice) * 100) : 0;

    return {
      ...result,
      extension,
      displayPrice: firstYearPrice,
      secondYearPrice: secondYearPrice,
      retailPrice: secondYearPrice,
      discount: discount,
      popular: extInfo.popular,
      savings: secondYearPrice - firstYearPrice,
      formattedPrice: `$${firstYearPrice.toFixed(2)}/yr`,
      formattedSecondYearPrice: `$${secondYearPrice.toFixed(2)}/yr`,
      discountText: discount > 0 ? `${discount}% OFF` : null,
      specialOffer: discount > 50 ? `ONLY $${(firstYearPrice * 2).toFixed(2)} FOR 2 YEARS` : null,
      renewalPrice: secondYearPrice,
      currency: realPricing.currency,
      namecheapPrice: namecheapPrice,
      markup: 50
    };
  });

  const sortedResults = enhancedResults.sort((a: any, b: any) => {
    if (a.available !== b.available) {
      return a.available ? -1 : 1;
    }
    if (a.popular !== b.popular) {
      return a.popular ? -1 : 1;
    }
    return a.displayPrice - b.displayPrice;
  });

  const primaryResult = sortedResults.find((r: any) => r.available) || sortedResults[0];
  const suggestions = sortedResults.filter((r: any) => r !== primaryResult);

  return {
    success: true,
    domain: baseDomain,
    primaryResult,
    suggestions,
    results: sortedResults,
    totalChecked: domainsToCheck.length,
    availableCount: results.filter((r: any) => r.available).length
  };
}

export async function POST(request: NextRequest) {
  try {
    const { domain } = await request.json();
    if (!domain) {
      return NextResponse.json({ error: 'Domain name is required' }, { status: 400 });
    }
    const baseDomain = domain.replace(/\.(com|org|net|io|co|ai|lat|to)$/i, '').toLowerCase();
    const data = await searchDomains(baseDomain);
    return NextResponse.json(data);

  } catch (error) {
    console.error('Domain search error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to search domain',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('query') || searchParams.get('domain') || '';
    if (!q) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }
    const baseDomain = q.replace(/\.(com|org|net|io|co|ai|lat|to)$/i, '').toLowerCase();
    const data = await searchDomains(baseDomain);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Domain search (GET) error:', error);
    const status = (error as any)?.status || 500;
    const details = error instanceof Error ? error.message : 'Unknown error';
    const extra = (error as any)?.details ? { details: (error as any).details } : {};
    return NextResponse.json({ error: 'Failed to search domain', ...extra, details }, { status });
  }
}
