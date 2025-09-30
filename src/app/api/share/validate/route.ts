import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('t');
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      data: unknown;
      permissions: string;
      exp: number;
    };
    
    return NextResponse.json({ 
      success: true, 
      formData: decoded.data,
      permissions: decoded.permissions,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json(
        { error: 'Invalid or expired token' }, 
        { status: 401 }
      );
    }
    
    console.error('Error validating token:', error);
    return NextResponse.json(
      { error: 'Failed to validate token' }, 
      { status: 500 }
    );
  }
}
