import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

const clientId = process.env.COGNITO_CLIENT_ID;
const clientSecret = process.env.COGNITO_CLIENT_SECRET;
const issuer = process.env.COGNITO_ISSUER;

// Debug logging at runtime
console.log("Auth route env check:", {
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  AUTH_SECRET: !!process.env.AUTH_SECRET,
  COGNITO_CLIENT_ID: !!clientId,
  COGNITO_CLIENT_SECRET: !!clientSecret,
  COGNITO_ISSUER: issuer,
});

if (!clientId || !clientSecret || !issuer) {
  console.error("❌ Missing required Cognito env vars", {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    hasIssuer: !!issuer,
  });
  throw new Error("Missing required Cognito environment variables");
}

const handler = NextAuth({
  pages: { signIn: "/signin" },
  providers: [
    CognitoProvider({
      clientId,
      clientSecret,
      issuer,
    }),
  ],
  callbacks: {
    async session({ session }) {
      return session;
    },
  },
});

export { handler as GET, handler as POST };