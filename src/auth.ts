// src/auth.ts
import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";

const {
  COGNITO_CLIENT_ID = "",
  COGNITO_CLIENT_SECRET,
  COGNITO_DOMAIN = "",
  // Either issuer OR wellKnown work. Using wellKnown (Hosted UI) is the least error-prone.
  // COGNITO_ISSUER can remain in Amplify; not required when using wellKnown.
} = process.env;

export const {
  handlers,   // { GET, POST }
  auth,
  signIn,
  signOut,
} = NextAuth({
  // Make prod behind Amplify proxies just work:
  trustHost: true,

  // If you prefer JWTs (no database):
  session: { strategy: "jwt" },

  // Our only provider: Cognito
  providers: [
    Cognito({
      clientId: COGNITO_CLIENT_ID,
      // If your Cognito App Client has a secret, include it; otherwise remove this line.
      // Type is fine when undefined in Auth.js v5.
      clientSecret: COGNITO_CLIENT_SECRET,
      // Use wellKnown endpoint based on Hosted UI domain
      wellKnown: `${COGNITO_DOMAIN}/.well-known/openid-configuration`,
      // If you prefer issuer style instead, you can switch to:
      // issuer: process.env.COGNITO_ISSUER, // e.g. https://cognito-idp.us-west-1.amazonaws.com/us-west-1_XXXX
      checks: ["pkce", "state"], // good defaults
    }),
  ],

  // Send users to our custom sign-in page
  pages: {
    signIn: "/signin",
  },

  // (Optional) turn on debug temporarily if you need more logs
  // debug: process.env.NODE_ENV !== "production",
});