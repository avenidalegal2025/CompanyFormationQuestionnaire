import NextAuth, { AuthOptions } from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

// ⚠️ Ensure these are set in Vercel → Project Settings → Environment Variables
const authOptions: AuthOptions = {
  session: { strategy: "jwt" },

  providers: [
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID!,
      clientSecret: process.env.AUTH0_CLIENT_SECRET!,
      issuer: process.env.AUTH0_ISSUER, // e.g. https://your-tenant.us.auth0.com
    }),
  ],

  callbacks: {
    async jwt({ token, account, profile }) {
      // Add custom claims if needed
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },

    async session({ session, token }) {
      if (token?.accessToken) {
        (session as any).accessToken = token.accessToken;
      }
      return session;
    },
  },
};

// Export for NextAuth App Router
export const { handlers, signIn, signOut, auth } = NextAuth(authOptions);