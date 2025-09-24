import NextAuth from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

const clientId = process.env.AUTH0_CLIENT_ID!;
const clientSecret = process.env.AUTH0_CLIENT_SECRET!;
const issuer = process.env.AUTH0_ISSUER!; // e.g. https://your-tenant.us.auth0.com
const secret = process.env.AUTH_SECRET!;

if (!clientId || !clientSecret || !issuer || !secret) {
  console.error("Missing Auth0 env vars", {
    AUTH0_CLIENT_ID: !!clientId,
    AUTH0_CLIENT_SECRET: !!clientSecret,
    AUTH0_ISSUER: !!issuer,
    AUTH_SECRET: !!secret,
  });
  throw new Error("Missing Auth0 environment variables");
}

const handler = NextAuth({
  secret,
  pages: { signIn: "/signin" },
  providers: [
    Auth0Provider({
      clientId,
      clientSecret,
      issuer,
    }),
  ],
  callbacks: {
    async session({ session }) {
      return session; // default session is fine
    },
  },
});

export { handler as GET, handler as POST };