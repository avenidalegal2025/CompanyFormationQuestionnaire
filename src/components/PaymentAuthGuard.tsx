"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PaymentAuthGuardProps {
  children: React.ReactNode;
}

export default function PaymentAuthGuard({ children }: PaymentAuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user has completed payment
    const paymentCompleted = typeof window !== 'undefined' 
      ? localStorage.getItem('paymentCompleted') === 'true'
      : false;

    if (paymentCompleted) {
      // User has completed payment, allow access
      setIsAuthenticated(true);
      setIsLoading(false);
    } else {
      // User hasn't completed payment, redirect to sign-in
      router.push('/signin?callbackUrl=/client');
    }
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return <>{children}</>;
}





