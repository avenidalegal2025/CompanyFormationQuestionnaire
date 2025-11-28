"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Helper function to check if any owner has SSN
function hasOwnerWithSSN(owners: any[] | undefined): boolean {
  if (!owners || !Array.isArray(owners)) return false;
  return owners.some(owner => owner?.tin && owner.tin.trim() !== '');
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState<string>('5-7 días');

  useEffect(() => {
    if (sessionId) {
      // Fetch session email and save to localStorage
      const fetchSessionEmail = async () => {
        try {
          const response = await fetch(`/api/session/email?session_id=${sessionId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.email) {
              localStorage.setItem('userEmail', data.email);
            }
          }
        } catch (error) {
          console.error('Error fetching session email:', error);
        }
      };

      fetchSessionEmail();
      
      // Set a flag in localStorage to indicate payment completion
      if (typeof window !== 'undefined') {
        localStorage.setItem('paymentCompleted', 'true');
        localStorage.setItem('paymentSessionId', sessionId);
        
        // Check formData from localStorage to determine processing time
        const savedData = localStorage.getItem('questionnaireData');
        if (savedData) {
          try {
            const formData = JSON.parse(savedData);
            const owners = formData?.owners || [];
            const hasSSN = hasOwnerWithSSN(owners);
            setProcessingTime(hasSSN ? '5-7 días' : '1 mes para tramitar el ITIN con el IRS');
          } catch (error) {
            console.error('Error parsing saved data:', error);
          }
        }
      }
      
      setLoading(false);
    } else {
      setError('No session ID found');
      setLoading(false);
    }
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Processing your payment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error de Pago</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Regresar al Inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-green-600 text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Pago Exitoso!</h1>
        <p className="text-gray-600 mb-6">
          Gracias por tu pedido. Comenzaremos a procesar la formación de tu empresa inmediatamente.
        </p>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-900 mb-2">¿Qué sigue?</h2>
          <ul className="text-sm text-blue-800 text-left space-y-1">
            <li>• Revisaremos tu información</li>
            <li>• Archivaremos los documentos de formación de tu empresa</li>
            <li>• Configuraremos tu dirección comercial y teléfono</li>
            <li>• Prepararemos tu acuerdo operativo/de accionistas</li>
            <li>• Te enviaremos toda la documentación en {processingTime}</li>
          </ul>
        </div>

        <div className="space-y-3">
          <Link
            href="/client"
            className="block w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700"
          >
            Ir a Mi Hub Empresarial
          </Link>
          <Link
            href="/landing"
            className="block w-full bg-gray-200 text-gray-800 py-3 px-4 rounded-lg hover:bg-gray-300"
          >
            Ver Página Principal
          </Link>
          <button
            onClick={() => window.print()}
            className="block w-full bg-gray-100 text-gray-600 py-3 px-4 rounded-lg hover:bg-gray-200"
          >
            Imprimir Recibo
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccess() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}

