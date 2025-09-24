import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

const clientId = process.env.COGNITO_CLIENT_ID!;
const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
const issuer = process.env.COGNITO_ISSUER!;
const authSecret = process.env.AUTH_SECRET;
const nextAuthUrl = process.env.NEXTAUTH_URL;

if (!clientId || !clientSecret || !issuer) {
  console.error("Missing Cognito env vars", {
    clientId: !!clientId,
    clientSecret: !!clientSecret,
    issuer: !!issuer,
  });
  throw new Error("Missing Cognito environment variables");
}

const handler = NextAuth({
  secret: authSecret,
  providers: [
    CognitoProvider({
      clientId,
      clientSecret,
      issuer,
    }),
  ],
  pages: { signIn: "/signin" },
  callbacks: {
    async session({ session }) {
      return session;
    },
  },
});

export { handler as GET, handler as POST };