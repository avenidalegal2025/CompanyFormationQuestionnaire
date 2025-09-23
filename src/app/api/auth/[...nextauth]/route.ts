import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

const {
  COGNITO_CLIENT_ID,
  COGNITO_CLIENT_SECRET,
  COGNITO_ISSUER,
  AUTH_SECRET,
  NEXTAUTH_SECRET, // fallback if you had this set
} = process.env;

if (!COGNITO_CLIENT_ID || !COGNITO_CLIENT_SECRET || !COGNITO_ISSUER) {
  throw new Error(
    "Missing Cognito env vars. Set COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, and COGNITO_ISSUER in Amplify."
  );
}

const handler = NextAuth({
  // Make the secret explicit so we’re not dependent on a specific env name
  secret: AUTH_SECRET || NEXTAUTH_SECRET,
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