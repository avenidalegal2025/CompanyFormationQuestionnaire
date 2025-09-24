import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID!;
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET!;
const COGNITO_ISSUER = process.env.COGNITO_ISSUER!;
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

if (!COGNITO_CLIENT_ID || !COGNITO_CLIENT_SECRET || !COGNITO_ISSUER || !AUTH_SECRET) {
  throw new Error("Missing Cognito or NextAuth env vars.");
}

const handler = NextAuth({
  secret: AUTH_SECRET,
  pages: { signIn: "/signin" },
  providers: [
    CognitoProvider({
      clientId: COGNITO_CLIENT_ID,
      clientSecret: COGNITO_CLIENT_SECRET,
      issuer: COGNITO_ISSUER,
    }),
  ],
  callbacks: {
    async session({ session }) {
      return session;
    },
  },
});

export { handler as GET, handler as POST };