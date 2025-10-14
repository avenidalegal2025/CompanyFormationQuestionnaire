import NextAuth from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

const clientId = process.env.AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET;
const issuer = process.env.AUTH0_ISSUER;
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
  ? NextAuth({
      secret,
      pages: { signIn: "/signin" },
      providers: [
        Auth0Provider({
          clientId,
          clientSecret,
          issuer,
        }),
      ],
      callbacks: {
        async session({ session }) {
          return session; // default session is fine
        },
      },
    })
  : NextAuth({
      secret: secret || "fallback-secret-for-build",
      pages: { signIn: "/signin" },
      providers: [], // No providers during build
      callbacks: {
        async session({ session }) {
          return session;
        },
      },
    });

export { handler as GET, handler as POST };