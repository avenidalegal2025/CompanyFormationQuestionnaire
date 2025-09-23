import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";

/**
 * IMPORTANT
 * - These env vars must be set in Amplify (same names, no NEXT_PUBLIC_ prefix):
 *   COGNITO_CLIENT_ID
 *   COGNITO_CLIENT_SECRET
 *   COGNITO_ISSUER   (e.g. https://cognito-idp.<region>.amazonaws.com/<userPoolId>)
 *
 * - Do NOT export anything other than GET and POST from this route file.
 * - This uses NextAuth v5 API shape.
 */
export const { handlers: { GET, POST } } = NextAuth({
  pages: { signIn: "/signin" },
  providers: [
    Cognito({
      clientId: process.env.COGNITO_CLIENT_ID!,        // non-null assertion for TS
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,// required by provider types
      issuer: process.env.COGNITO_ISSUER!,             // e.g. https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX
    }),
  ],
});