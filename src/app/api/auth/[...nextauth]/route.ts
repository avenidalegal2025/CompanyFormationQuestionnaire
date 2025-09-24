import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

const clientId = process.env.NEXTAUTH_COGNITO_CLIENT_ID!;
const clientSecret = process.env.NEXTAUTH_COGNITO_CLIENT_SECRET!;
const issuer = process.env.NEXTAUTH_COGNITO_ISSUER!;

if (!clientId || !clientSecret || !issuer) {
  console.error("Missing Cognito env vars", {
    clientId: !!clientId,
    clientSecret: !!clientSecret,
    issuer: !!issuer,
  });
  throw new Error("Missing Cognito environment variables");
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