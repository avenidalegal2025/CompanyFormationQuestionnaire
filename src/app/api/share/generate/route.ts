import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function POST(request: NextRequest) {
  try {
    const { formData, permissions = 'view' } = await request.json();
    
    if (!formData) {
      return NextResponse.json({ error: 'Form data is required' }, { status: 400 });
    }

    // Create JWT token with form data and permissions
    const token = jwt.sign(
      {
        formData,
        permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days expiration
      },
      JWT_SECRET
    );

    // Generate magic link
    const originFromRequest = request.nextUrl.origin;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || originFromRequest;
    const magicLink = `${baseUrl}/collaborate?token=${token}`;

    return NextResponse.json({ 
      success: true, 
      magicLink,
      expiresIn: '7 days'
    });

  } catch (error) {
    console.error('Error generating magic link:', error);
    return NextResponse.json(
      { error: 'Failed to generate magic link' }, 
      { status: 500 }
    );
  }
}
