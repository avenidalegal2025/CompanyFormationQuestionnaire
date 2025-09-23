// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";
import type { JWT } from "next-auth/jwt";

// ---- Type augmentation so we can carry the access token without `any`
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

// ---- Env (required)
const {
  COGNITO_CLIENT_ID,
  COGNITO_CLIENT_SECRET,
  COGNITO_ISSUER,   // e.g. https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC123
  NEXTAUTH_SECRET,
} = process.env;

if (!COGNITO_CLIENT_ID || !COGNITO_CLIENT_SECRET || !COGNITO_ISSUER || !NEXTAUTH_SECRET) {
  throw new Error(
    "Missing env: COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, COGNITO_ISSUER, NEXTAUTH_SECRET."
  );
}

// ---- Configure NextAuth (v5 style)
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Cognito({
      clientId: COGNITO_CLIENT_ID,
      clientSecret: COGNITO_CLIENT_SECRET,
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

// ---- Route exports for the App Router
export const GET = handlers.GET;
export const POST = handlers.POST;