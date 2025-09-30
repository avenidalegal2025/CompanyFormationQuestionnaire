import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('t') || searchParams.get('token');
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as
      | {
          draftId: string;
          permissions: string;
          exp: number;
        }
      | {
          d?: { c?: { n?: string; t?: string }; o?: Array<{ n?: string; p?: number | string }> };
          permissions: string;
          exp: number;
        }
      | {
          formData: unknown;
          permissions: string;
          exp: number;
        };
    
    // Expand compact payload to a friendlier structure for the page
    let expanded: unknown;
    if ('draftId' in decoded) {
      // Load from DB by draftId
      const url = `${request.nextUrl.origin}/api/db/load?draftId=${encodeURIComponent(decoded.draftId)}`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to load draft' }, { status: 500 });
      }
      const json = (await res.json()) as { ok: true; item?: { data?: unknown } | null };
      expanded = json.item?.data ?? {};
    } else if ('d' in decoded && decoded.d) {
      expanded = {
        company: decoded.d?.c ? { companyName: decoded.d.c.n, entityType: decoded.d.c.t } : undefined,
        owners: decoded.d?.o?.map((x) => ({ fullName: x.n, ownership: x.p })) || [],
      };
    } else if ('formData' in decoded) {
      const legacyDecoded = decoded as { formData: unknown };
      expanded = legacyDecoded.formData ?? {};
    } else {
      expanded = {};
    }

    return NextResponse.json({
      success: true,
      formData: expanded as unknown,
      permissions: decoded.permissions,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
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
