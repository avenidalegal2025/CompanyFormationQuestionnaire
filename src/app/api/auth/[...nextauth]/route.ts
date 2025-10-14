import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const clientId = process.env.AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET;
const issuer = process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH0_ISSUER;
const secret = process.env.AUTH_SECRET;

// Debug logging
console.log('Auth0 Config Check:', {
  hasClientId: !!clientId,
  hasClientSecret: !!clientSecret,
  hasIssuer: !!issuer,
  hasSecret: !!secret,
  issuer: issuer
});

// Only create Auth0 handler if all required environment variables are available
const handler = (clientId && clientSecret && issuer && secret)
  ? NextAuth(authOptions)
  : NextAuth({
      secret: secret || "fallback-secret-for-build",
      pages: { signIn: "/signin" },
      session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      },
      providers: [], // No providers during build
      callbacks: {
        async session({ session }) {
          return session;
        },
      },
    });

export { handler as GET, handler as POST };