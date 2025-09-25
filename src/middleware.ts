// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Public routes that do NOT require a session.
 * Add/remove as needed.
 */
const PUBLIC_PATHS = [
  "/signin",
  "/api/auth",   // next-auth routes & callbacks
  "/diag",
  "/api/diag",
  "/favicon.ico",
  "/logo.svg",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets/CDN files entirely
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/static/") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|map|txt|xml)$/i)
  ) {
    return NextResponse.next();
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Require a NextAuth token for everything else (Edge-safe)
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET, // must be set in Vercel
  });

  if (!token) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Run on everything; we filter inside (no unsupported regex/lookaheads).
 */
export const config = {
  matcher: ["/:path*"],
};