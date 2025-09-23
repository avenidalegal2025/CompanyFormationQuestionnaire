// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";
import type { JWT } from "next-auth/jwt";

// Augment types so we can stash the access token without `any`
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
  COGNITO_CLIENT_SECRET,  // <-- required
  COGNITO_ISSUER,        // e.g. https://cognito-idp.us-west-1.amazonaws.com/us-west-1_XXXX
  NEXTAUTH_SECRET,
} = process.env;

if (!COGNITO_CLIENT_ID || !COGNITO_CLIENT_SECRET || !COGNITO_ISSUER || !NEXTAUTH_SECRET) {
  throw new Error(
    "Missing env: COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, COGNITO_ISSUER, NEXTAUTH_SECRET must be set."
  );
}

const auth = NextAuth({
  secret: NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Cognito({
      clientId: COGNITO_CLIENT_ID,
      clientSecret: COGNITO_CLIENT_SECRET,  // pass a definite string
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

export const GET = auth.handlers.GET;
export const POST = auth.handlers.POST;