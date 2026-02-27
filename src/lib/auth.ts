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
  debug: process.env.NODE_ENV === 'development',
  providers: [
    Auth0Provider({
      clientId: clientId!,
      clientSecret: clientSecret!,
      issuer: issuer!,
      authorization: {
        params: {
          scope: "openid email profile",
          screen_hint: "signup",
        },
      },
      checks: [],
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // After login, always redirect to the home page.
      // The client-side logic on "/" decides whether to show the questionnaire
      // (for regular users or admin users mid-questionnaire) or redirect to
      // /admin/documents (for admin users with no pending callback).
      // This prevents stale next-auth callback-url cookies from sending
      // users to /admin/* or other unexpected destinations.
      if (url.startsWith(baseUrl)) {
        // Internal URL — only allow /client/* and / (block /admin/* as post-login target)
        if (url.includes('/admin')) {
          return baseUrl;
        }
        return url;
      }
      // External URL (e.g. Auth0 logout) — allow as-is
      return url;
    },
    async session({ session, token }: { session: any; token: any }) {
      // Ensure session persists with token data
      if (token) {
        session.user = token.user as any;
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
    async jwt({ token, account, user, profile }: { token: any; account: any; user: any; profile?: any }) {
      // Persist OAuth access_token and user info to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
      }

      // Extract user data from Auth0 profile or user object
      if (user || profile) {
        const userData = user || profile;
        token.user = {
          id: userData.sub || userData.id,
          name: userData.name || userData.nickname || (userData.given_name && userData.family_name ? `${userData.given_name} ${userData.family_name}` : 'User'),
          email: userData.email,
          image: userData.picture || userData.avatar_url
        };
      }

      return token;
    },
    async signIn({ user, account, profile }: { user: any; account: any; profile?: any }) {
      return true; // Allow sign in
    },
  },
};
