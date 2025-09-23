import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

const handler = NextAuth({
  providers: [
    CognitoProvider({
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer: process.env.COGNITO_ISSUER!, // e.g. https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXX
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  // Optional callbacks if you want to inspect tokens/sessions
  callbacks: {
    async session({ session, token }) {
      // you can put token info on session.user if needed
      return session;
    },
  },
});

export { handler as GET, handler as POST };