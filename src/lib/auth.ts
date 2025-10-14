import NextAuth from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

const clientId = process.env.AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET;
const issuer = process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH0_ISSUER;
const secret = process.env.AUTH_SECRET;

export const authOptions = {
  secret,
  pages: { signIn: "/signin" },
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },
  providers: [
    Auth0Provider({
      clientId: clientId!,
      clientSecret: clientSecret!,
      issuer: issuer!,
    }),
  ],
  callbacks: {
    async session({ session, token }: { session: any; token: any }) {
      // Ensure session persists with token data
      if (token) {
        session.user = token.user as any;
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
    async jwt({ token, account, user }: { token: any; account: any; user: any }) {
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
};
