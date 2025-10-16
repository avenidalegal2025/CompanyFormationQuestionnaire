import NextAuth from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

const clientId = process.env.AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET;
const issuer = process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH0_ISSUER;
const secret = process.env.AUTH_SECRET;

export const authOptions = {
  secret,
  pages: { signIn: "/signin" },
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },
  debug: process.env.NODE_ENV === 'development',
  providers: [
    Auth0Provider({
      clientId: clientId!,
      clientSecret: clientSecret!,
      issuer: issuer!,
      authorization: {
        params: {
          scope: "openid email profile",
          screen_hint: "signup",
        },
      },
      checks: ["state"],
    }),
  ],
  callbacks: {
    async session({ session, token }: { session: any; token: any }) {
      console.log('Session callback - token:', token ? 'present' : 'missing');
      console.log('Session callback - session:', session ? 'present' : 'missing');
      
      // Ensure session persists with token data
      if (token) {
        session.user = token.user as any;
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
    async jwt({ token, account, user, profile }: { token: any; account: any; user: any; profile?: any }) {
      console.log('JWT callback - account:', account ? 'present' : 'missing');
      console.log('JWT callback - user:', user ? 'present' : 'missing');
      console.log('JWT callback - profile:', profile ? 'present' : 'missing');
      console.log('JWT callback - token:', token ? 'present' : 'missing');
      
      // Persist OAuth access_token and user info to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        console.log('Added access token to JWT');
      }
      
      // Extract user data from Auth0 profile or user object
      if (user || profile) {
        const userData = user || profile;
        token.user = {
          id: userData.sub || userData.id,
          name: userData.name || userData.nickname || (userData.given_name && userData.family_name ? `${userData.given_name} ${userData.family_name}` : 'User'),
          email: userData.email,
          image: userData.picture || userData.avatar_url
        };
        console.log('Added user to JWT:', token.user);
      }
      
      return token;
    },
    async signIn({ user, account, profile }: { user: any; account: any; profile?: any }) {
      console.log('SignIn callback - user:', user);
      console.log('SignIn callback - account:', account);
      console.log('SignIn callback - profile:', profile);
      return true; // Allow sign in
    },
  },
};
