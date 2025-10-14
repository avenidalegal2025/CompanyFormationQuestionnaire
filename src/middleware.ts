import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req) {
    // This function is called for all matched routes
    // The authentication check is handled by withAuth
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow access to /client/* routes only if user is authenticated
        if (req.nextUrl.pathname.startsWith('/client')) {
          return !!token;
        }
        // Allow all other routes
        return true;
      },
    },
  }
);

export const config = {
  matcher: [
    '/client/:path*'
  ]
};