import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Emails allowed to access /admin/* routes */
const ADMIN_EMAILS = [
  'avenidalegal.2024@gmail.com',
  'info@avenidalegal.com',
  'rodolfo@avenidalegal.lat',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get session token (works with both secure and non-secure cookies)
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName:
      process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
  });

  const isAuthenticated = !!token;

  // --- Protected routes: require authentication ---
  if (pathname.startsWith('/client') || pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      const signInUrl = new URL('/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  // --- Admin routes: require admin email ---
  if (pathname.startsWith('/admin')) {
    const email = ((token as any)?.user?.email || (token as any)?.email || '').toLowerCase().trim();
    if (!ADMIN_EMAILS.includes(email)) {
      // Non-admin user trying to access admin panel → send to client dashboard
      return NextResponse.redirect(new URL('/client', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/client/:path*',
    '/admin/:path*',
  ],
};
