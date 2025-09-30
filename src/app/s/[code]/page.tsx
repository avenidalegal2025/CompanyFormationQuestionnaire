"use client";

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default function ShortUrlRedirect({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndRedirect = async () => {
      try {
        const response = await fetch(`/api/short/resolve/${resolvedParams.code}`);
        const result = await response.json();

        if (result.success && result.formData) {
          // Redirect to collaborate page with the data
          router.push(`/collaborate?data=${encodeURIComponent(JSON.stringify(result))}`);
        } else {
          setError(result.error || 'Enlace inválido o expirado');
        }
      } catch (err) {
        console.error('Error resolving short URL:', err);
        setError('Error al resolver el enlace');
      }
    };

    void fetchAndRedirect();
  }, [resolvedParams.code, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Enlace inválido</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <a 
            href="/" 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirigiendo...</p>
      </div>
    </div>
  );
}
