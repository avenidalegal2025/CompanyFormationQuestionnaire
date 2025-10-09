import NextAuth, { type AuthOptions } from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

const authOptions: AuthOptions = {
  // Use stateless JWT sessions (no DB needed)
  session: { strategy: "jwt" },

  // Auth0 (socials like Google/Microsoft can be enabled inside Auth0)
  providers: [
    // Only add Auth0 provider if environment variables are available
    ...(process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET && process.env.AUTH0_ISSUER
      ? [
          Auth0Provider({
            clientId: process.env.AUTH0_CLIENT_ID,
            clientSecret: process.env.AUTH0_CLIENT_SECRET,
            issuer: process.env.AUTH0_ISSUER, // e.g. https://your-tenant.us.auth0.com
          }),
        ]
      : []),
  ],

  callbacks: {
    // Store provider access token in the JWT (optional, safe typing)
    async jwt({ token, account }) {
      if (account?.access_token) {
        (token as Record<string, unknown>).accessToken = account.access_token;
      }
      return token;
    },

    // Keep session shape default to avoid `any` typing issues
    async session({ session }) {
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authOptions);