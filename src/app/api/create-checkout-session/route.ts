import { NextRequest, NextResponse } from 'next/server';
import { SERVICES } from '@/lib/pricing';

export async function POST(request: NextRequest) {
  try {
    const { formData, selectedServices, totalPrice } = await request.json();

    // For now, return a mock session ID for testing
    // In production, you would integrate with Stripe here
    const mockSessionId = `cs_test_${Date.now()}`;

    console.log('Checkout request:', {
      formData: formData.company?.entityType,
      selectedServices,
      totalPrice,
    });

    return NextResponse.json({ 
      sessionId: mockSessionId,
      message: 'Checkout session created (demo mode)' 
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
