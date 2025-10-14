"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    console.log('AuthWrapper - Auth status:', status);
    console.log('AuthWrapper - Session:', session);
    
    if (status === 'loading') return; // Still loading
    
    if (status === 'unauthenticated' || !session) {
      console.log('AuthWrapper - Redirecting to signin - status:', status, 'session:', !!session);
      router.push('/signin');
      return;
    }
  }, [status, session, router]);

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-700">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated
  if (status === 'unauthenticated' || !session) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
