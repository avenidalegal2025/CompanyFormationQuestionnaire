// src/auth.ts
import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? "";
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET ?? "";
const COGNITO_ISSUER = process.env.COGNITO_ISSUER ?? "";

export const authOptions = {
  providers: [
    CognitoProvider({
      clientId: COGNITO_CLIENT_ID,
      clientSecret: COGNITO_CLIENT_SECRET,
      issuer: COGNITO_ISSUER,
    }),
  ],
  pages: {
    signIn: "/signin", // custom sign-in page
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);

// Re-export GET/POST for the App Router API route
export const { GET, POST } = handlers;