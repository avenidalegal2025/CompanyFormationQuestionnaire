import NextAuth from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

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
  ? NextAuth({
      secret,
      pages: { signIn: "/signin" },
      session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      },
      cookies: {
        sessionToken: {
          name: `__Secure-next-auth.session-token`,
          options: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: process.env.NODE_ENV === 'production'
          }
        }
      },
      providers: [
        Auth0Provider({
          clientId,
          clientSecret,
          issuer,
        }),
      ],
      callbacks: {
        async session({ session, token }) {
          // Ensure session persists with token data
          if (token) {
            session.user = token.user as any;
            session.accessToken = token.accessToken as string;
          }
          return session;
        },
        async jwt({ token, account, user }) {
          // Persist OAuth access_token and user info to the token right after signin
          if (account) {
            token.accessToken = account.access_token;
          }
          if (user) {
            token.user = user;
          }
          return token;
        },
      },
    })
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