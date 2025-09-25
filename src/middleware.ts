// src/middleware.ts
export { auth as middleware } from "@/auth";

// Configure which paths are protected by default.
// This protects EVERYTHING except the explicit public routes below.
export const config = {
  matcher: [
    // Protect all app paths…
    "/((?!_next/|favicon.ico|logo.svg|public/|api/auth/|signin|diag|api/diag).*)",
    // …and protect API routes except NextAuth + diag
    "/api/(?!auth/|diag).*",
  ],
};