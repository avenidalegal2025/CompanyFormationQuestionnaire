"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export default function AuthProvider({ children }: { children: ReactNode }) {
  // Keep client-side only to avoid RSC warnings
  return <SessionProvider>{children}</SessionProvider>;
}