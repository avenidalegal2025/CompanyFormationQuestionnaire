import { NextRequest, NextResponse } from 'next/server';

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token';

export async function POST(request: NextRequest) {
  try {
    const { domain } = await request.json();

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain name is required' },
        { status: 400 }
      );
    }

    // Clean the domain name (remove extensions if user included them)
    const baseDomain = domain.replace(/\.(com|org|net|io|co|ai|lat|to)$/i, '').toLowerCase();
    
    // Define the most common domain extensions (pricing will be fetched from Namecheap)
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

    // Create domain list with all extensions
    const domainsToCheck = commonExtensions.map((ext: any) => `${baseDomain}.${ext.ext}`);

    // Call Namecheap proxy to search for domain availability
    const response = await fetch(`${NAMECHEAP_PROXY_URL}/domains/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': PROXY_TOKEN,
      },
      body: JSON.stringify({
        domains: domainsToCheck
      }),
    });

    if (!response.ok) {
      throw new Error(`Namecheap API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    // Get real pricing from Namecheap
    const pricingResponse = await fetch(`${NAMECHEAP_PROXY_URL}/domains/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': PROXY_TOKEN,
      },
      body: JSON.stringify({
        domains: domainsToCheck
      }),
    });

    let pricingData: { [key: string]: any } = {};
    if (pricingResponse.ok) {
      const pricingResult = await pricingResponse.json();
      if (pricingResult.success) {
        pricingData = pricingResult.pricing.reduce((acc: { [key: string]: any }, item: any) => {
          acc[item.domain] = item;
          return acc;
        }, {});
      }
    }

    // Enhance results with real pricing data
    const enhancedResults = results.map((result: any) => {
      const extension = result.domain.split('.').pop() || '';
      const extInfo = commonExtensions.find((ext: any) => ext.ext === extension) || {
        ext: extension,
        popular: false
      };

      // Get real pricing from Namecheap
      const realPricing = pricingData[result.domain] || {
        price: 12.99,
        renewal_price: 12.99,
        currency: 'USD'
      };

      // Calculate discount (using renewal price as "retail" price)
      const retailPrice = realPricing.renewal_price || realPricing.price * 1.2;
      const discount = retailPrice > realPricing.price ? 
        Math.round(((retailPrice - realPricing.price) / retailPrice) * 100) : 0;

      return {
        ...result,
        extension,
        displayPrice: realPricing.price,
        retailPrice: retailPrice,
        discount: discount,
        popular: extInfo.popular,
        savings: retailPrice - realPricing.price,
        formattedPrice: `$${realPricing.price.toFixed(2)}/yr`,
        formattedRetailPrice: `$${retailPrice.toFixed(2)}/yr`,
        discountText: discount > 0 ? `${discount}% OFF` : null,
        specialOffer: discount > 50 ? `ONLY $${(realPricing.price * 2).toFixed(2)} FOR 2 YEARS` : null,
        renewalPrice: realPricing.renewal_price,
        currency: realPricing.currency
      };
    });

    // Sort results: available first, then by popularity, then by price
    const sortedResults = enhancedResults.sort((a: any, b: any) => {
      if (a.available !== b.available) {
        return a.available ? -1 : 1; // Available first
      }
      if (a.popular !== b.popular) {
        return a.popular ? -1 : 1; // Popular first
      }
      return a.displayPrice - b.displayPrice; // Then by price
    });

    // Separate primary result (first available) and suggestions
    const primaryResult = sortedResults.find(r => r.available) || sortedResults[0];
    const suggestions = sortedResults.filter(r => r !== primaryResult);

    return NextResponse.json({
      success: true,
      domain: baseDomain,
      primaryResult,
      suggestions,
      results: sortedResults,
      totalChecked: domainsToCheck.length,
      availableCount: results.filter(r => r.available).length
    });

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
