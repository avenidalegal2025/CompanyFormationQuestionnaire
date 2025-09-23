import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID!;
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET!;
const COGNITO_ISSUER = process.env.COGNITO_ISSUER!; // e.g. https://cognito-idp.<region>.amazonaws.com/<userPoolId>

if (!COGNITO_CLIENT_ID || !COGNITO_CLIENT_SECRET || !COGNITO_ISSUER) {
  // Fail fast during build if anything is missing
  throw new Error(
    "Missing Cognito env vars. Set COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, and COGNITO_ISSUER in Amplify."
  );
}

const handler = NextAuth({
  pages: { signIn: "/signin" },
  providers: [
    CognitoProvider({
      clientId: COGNITO_CLIENT_ID,
      clientSecret: COGNITO_CLIENT_SECRET,
      issuer: COGNITO_ISSUER,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token?.sub) {
        // attach user id from token to session if you want
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };