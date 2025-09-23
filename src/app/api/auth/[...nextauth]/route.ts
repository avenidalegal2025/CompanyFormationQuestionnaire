// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/src/auth";

// Create the NextAuth handler
const handler = NextAuth(authOptions);

// App Router requires both GET and POST exports
export { handler as GET, handler as POST };