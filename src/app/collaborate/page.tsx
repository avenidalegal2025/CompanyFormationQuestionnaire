"use client";

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface CollaborationData {
  formData: Record<string, unknown>;
  permissions: string;
  expiresAt: string;
}

function CollaborateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<CollaborationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if we have data directly from short URL redirect
    // Support both compact token (?t=) and legacy token (?token=)
    const token = searchParams.get('t') || searchParams.get('token');
    
    if (!token) {
      setError('No se proporcionó un enlace de colaboración');
      setLoading(false);
      return;
    }

    // Validate the token via GET with query param
    fetch(`/api/share/validate?${searchParams.get('t') ? 't' : 'token'}=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          try {
            // Save for main page to load collaboration data
            window.localStorage.setItem('collabData', JSON.stringify(result.formData));
            window.localStorage.setItem('collabPermissions', String(result.permissions || 'view'));
          } catch {}
          setData(result);
          // Redirect straight into the main questionnaire to continue editing
          router.push('/?collab=1');
          return;
        } else {
          setError(result.error || 'Token inválido o expirado');
        }
      })
      .catch(err => {
        console.error('Error validating token:', err);
        setError('Error al validar el token');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Validando enlace de colaboración...</p>
        </div>
      </div>
    );
  }

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
          <Link 
            href="/" 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Colaboración activa</h1>
              <p className="text-gray-600">Tienes acceso de {data?.permissions === 'edit' ? 'edición' : 'solo lectura'}</p>
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="font-medium text-blue-900 mb-1">Información del enlace</h3>
                <p className="text-sm text-blue-700">
                  Este enlace expirará el {new Date(data?.expiresAt || '').toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Datos del cuestionario</h2>
            
            {data?.formData && (
              <div className="space-y-4">
                {(() => {
                  const company = data.formData.company;
                  if (company && typeof company === 'object' && company !== null) {
                    const companyData = company as Record<string, unknown>;
                    return (
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 mb-2">Información de la empresa</h3>
                        <div className="space-y-2 text-sm text-gray-600">
                          <p><span className="font-medium">Nombre:</span> {String(companyData.companyName || 'No especificado')}</p>
                          <p><span className="font-medium">Tipo:</span> {String(companyData.entityType || 'No especificado')}</p>
                          <p><span className="font-medium">Dirección:</span> {String(companyData.addressLine1 || 'No especificado')}</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {(() => {
                  const owners = data.formData.owners;
                  if (owners && Array.isArray(owners) && owners.length > 0) {
                    return (
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 mb-2">Propietarios</h3>
                        <div className="space-y-2">
                          {owners.map((owner: Record<string, unknown>, index: number) => (
                            <div key={index} className="text-sm text-gray-600">
                              <p><span className="font-medium">Propietario {index + 1}:</span> {String(owner.fullName || 'No especificado')}</p>
                              <p><span className="font-medium">Propiedad:</span> {String(owner.ownership || 0)}%</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-4">
            <Link 
              href="/" 
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Ir al inicio
            </Link>
            {data?.permissions === 'edit' && (
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Editar cuestionario
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CollaboratePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    }>
      <CollaborateContent />
    </Suspense>
  );
}
