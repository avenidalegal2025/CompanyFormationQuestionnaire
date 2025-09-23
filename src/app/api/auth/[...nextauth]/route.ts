// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";
import type { JWT } from "next-auth/jwt";

// --- Module augmentation so we can store accessToken without using `any`
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

const {
  COGNITO_CLIENT_ID,
  COGNITO_CLIENT_SECRET, // optional: omit if you created a public client
  COGNITO_ISSUER,        // e.g. https://cognito-idp.us-west-1.amazonaws.com/us-west-1_XXXX
  NEXTAUTH_SECRET,
} = process.env;

if (!COGNITO_CLIENT_ID || !COGNITO_ISSUER || !NEXTAUTH_SECRET) {
  throw new Error(
    "Missing env: COGNITO_CLIENT_ID, COGNITO_ISSUER, NEXTAUTH_SECRET must be set."
  );
}

// Create the NextAuth instance (no extra exports)
const auth = NextAuth({
  secret: NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  // Optional: send users to our custom sign-in page
  pages: { signIn: "/signin" },
  providers: [
    Cognito({
      clientId: COGNITO_CLIENT_ID,
      ...(COGNITO_CLIENT_SECRET ? { clientSecret: COGNITO_CLIENT_SECRET } : {}),
      issuer: COGNITO_ISSUER,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) token.accessToken = account.access_token;
      return token;
    },
    async session({ session, token }) {
      session.accessToken = (token as JWT).accessToken;
      return session;
    },
  },
});

// Only export HTTP handlers so the file is a valid Next.js Route
export const GET = auth.handlers.GET;
export const POST = auth.handlers.POST;