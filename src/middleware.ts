// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

/**
 * Public routes that do NOT require a session.
 * Add/remove as needed.
 */
const PUBLIC_PATHS = [
  "/signin",
  "/api/auth",   // next-auth callbacks
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

  // Skip static assets entirely (/_next/*, files with extensions, etc.)
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/static/") ||
    pathname.match(/^.*\.(png|jpg|jpeg|gif|svg|ico|css|js|map|txt|xml)$/i)
  ) {
    return NextResponse.next();
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Require auth for everything else
  const session = await auth();
  if (!session?.user) {
    const url = new URL("/signin", req.url);
    // send users back where they intended to go after signing in
    url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Run middleware broadly; we’ll filter inside.
 * Using a permissive matcher avoids fancy regex that Next.js disallows.
 */
export const config = {
  matcher: ["/:path*"],
};