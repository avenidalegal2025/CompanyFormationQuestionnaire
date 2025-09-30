import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function POST(request: NextRequest) {
  try {
    const { formData, permissions = 'edit' } = await request.json();
    
    if (!formData) {
      return NextResponse.json({ error: 'Form data is required' }, { status: 400 });
    }

    // Persist draft to DB and return a link with draftId and permissions
    const saveRes = await fetch(`${request.nextUrl.origin}/api/db/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: formData }),
    });
    if (!saveRes.ok) {
      const j = await saveRes.json().catch(() => ({}));
      return NextResponse.json({ error: j.error || 'Failed to save draft' }, { status: 500 });
    }
    const { id: draftId } = (await saveRes.json()) as { ok: true; id: string };

    const token = jwt.sign(
      { draftId, permissions, exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) },
      JWT_SECRET
    );

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

