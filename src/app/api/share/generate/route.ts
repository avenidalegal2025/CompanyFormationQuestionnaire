import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function POST(request: NextRequest) {
  try {
    const { formData, permissions = 'view' } = await request.json();
    
    if (!formData) {
      return NextResponse.json({ error: 'Form data is required' }, { status: 400 });
    }

    // Create an ultra-compact payload to reduce token size
    // Use short keys to minimize JWT length
    const compactData = {
      c: formData.company ? {
        n: formData.company.companyName,
        t: formData.company.entityType,
      } : undefined,
      o: Array.isArray(formData.owners)
        ? (formData.owners as unknown[]).map((o) => {
            const owner = (o ?? {}) as Record<string, unknown>;
            return {
              n: owner.fullName as string | undefined, // name
              p: owner.ownership as number | string | undefined, // percentage
            };
          })
        : undefined,
    } as const;

    // Create JWT token with compact data
    const token = jwt.sign(
      {
        d: compactData,
        permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days expiration
      },
      JWT_SECRET
    );

    // Generate magic link with shorter token
    const originFromRequest = request.nextUrl.origin;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || originFromRequest;
    const magicLink = `${baseUrl}/collaborate?t=${token}`;

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

