import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { domain } = await request.json();

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain name is required' },
        { status: 400 }
      );
    }

    // Mock response for testing
    const mockResults = [
      {
        domain: domain,
        available: true,
        price: 12.99,
        currency: 'USD',
        registrationPeriod: 1,
        renewalPrice: 12.99
      },
      {
        domain: domain.replace('.com', '.net'),
        available: true,
        price: 14.99,
        currency: 'USD',
        registrationPeriod: 1,
        renewalPrice: 14.99
      },
      {
        domain: domain.replace('.com', '.org'),
        available: false,
        price: 0,
        currency: 'USD',
        registrationPeriod: 0,
        renewalPrice: 0
      }
    ];

    return NextResponse.json({
      success: true,
      domain,
      results: mockResults,
      suggestions: [
        `${domain.replace('.com', '')}app.com`,
        `${domain.replace('.com', '')}io.com`,
        `${domain.replace('.com', '')}co.com`
      ]
    });

  } catch (error) {
    console.error('Mock domain search error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to search domain',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}




