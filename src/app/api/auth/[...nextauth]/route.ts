// src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import type { JWT } from "next-auth/jwt";

// ---- Module augmentation (lets us add accessToken without using `any`)
declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
  }
}

// Expect these to be set in Amplify Hosting -> Environment variables
const {
  COGNITO_CLIENT_ID,
  COGNITO_CLIENT_SECRET, // optional (public client may not have one)
  COGNITO_ISSUER,        // e.g. https://cognito-idp.us-west-1.amazonaws.com/us-west-1_XXXXXXX
  NEXTAUTH_URL,
  NEXTAUTH_SECRET,
} = process.env;

if (!COGNITO_CLIENT_ID || !COGNITO_ISSUER || !NEXTAUTH_URL || !NEXTAUTH_SECRET) {
  // Throwing a clear error helps if an env var is missing in Amplify
  throw new Error(
    "Missing required auth env vars. Ensure COGNITO_CLIENT_ID, COGNITO_ISSUER, NEXTAUTH_URL, NEXTAUTH_SECRET are set."
  );
}

export const authOptions: NextAuthOptions = {
  secret: NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
  },
  providers: [
    CognitoProvider({
      clientId: COGNITO_CLIENT_ID,
      // Only include clientSecret when you actually have one
      ...(COGNITO_CLIENT_SECRET ? { clientSecret: COGNITO_CLIENT_SECRET } : {}),
      issuer: COGNITO_ISSUER,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Persist Cognito access_token on initial sign-in
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = (token as JWT).accessToken;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };