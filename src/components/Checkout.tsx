"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { loadStripe } from '@stripe/stripe-js';
import { SERVICES, PACKAGES, calculateTotalPrice, formatPrice, FORMATION_PRICES } from '@/lib/pricing';
import type { AllSteps } from '@/lib/schema';

// Stripe will be initialized inside the component

interface CheckoutProps {
  formData: AllSteps;
  onSuccess: (sessionId: string) => void;
  onCancel: () => void;
  skipAgreement?: boolean;
}

export default function Checkout({ formData, onSuccess, onCancel, skipAgreement = false }: CheckoutProps) {
  const { data: session, status } = useSession();
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<any>(null);
  const [stripeLoading, setStripeLoading] = useState(true);

  // Initialize Stripe
  useEffect(() => {
    const initStripe = async () => {
      try {
        // Hardcoded publishable key for testing
        const publishableKey = 'pk_test_51SGTFyGoKexkldbNsdNd2lWJGuWB58srkRs8UBWOyQoGLkr6ecvAmr1X0ZiWc6ZITQvUx1aKXn3qOWJH1URddSXq00TVfjU31N';
        
        
        if (publishableKey) {
          const stripe = await loadStripe(publishableKey);
          setStripePromise(stripe);
        } else {
          setError('Stripe no está configurado correctamente');
        }
      } catch (err) {
        setError('Error al inicializar Stripe');
      } finally {
        setStripeLoading(false);
      }
    };

    initStripe();
  }, []);

  const entityType = formData.company?.entityType as 'LLC' | 'C-Corp';
  
  // If entityType is undefined, we can't show agreement services
  if (!entityType) {
    console.error('Checkout: entityType is undefined', {
      formData: formData,
      company: formData.company,
      entityType: formData.company?.entityType
    });
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error de Configuración</h2>
          <p className="text-red-700">
            No se pudo determinar el tipo de entidad. Por favor, regresa a los pasos anteriores y completa la información de la empresa.
          </p>
          <p className="text-sm text-red-600 mt-2">
            Entity Type: {formData.company?.entityType || 'undefined'}
          </p>
        </div>
      </div>
    );
  }
  const state = formData.company?.formationState || 'Delaware'; // Use formationState, not state
  const hasUsAddress = formData.company?.hasUsaAddress === 'Yes';
  const hasUsPhone = formData.company?.hasUsPhone === 'Yes';


  // Auto-select services based on user's current status
  useEffect(() => {
    const recommended: string[] = [];
    
    // Always add business address if user doesn't have one
    if (!hasUsAddress) {
      recommended.push('business_address');
    }
    
    // Always add business phone if user doesn't have one
    if (!hasUsPhone) {
      recommended.push('business_phone');
    }
    
    // Add agreement if user didn't skip it and it matches the entity type
    if (!skipAgreement) {
      if (entityType === 'LLC') {
        recommended.push('operating_agreement');
      } else if (entityType === 'C-Corp') {
        recommended.push('shareholder_agreement');
      }
    }
    
    setSelectedServices(recommended);
  }, [entityType, hasUsAddress, hasUsPhone, skipAgreement]);

  const totalPrice = calculateTotalPrice(selectedServices, entityType, state, hasUsAddress, hasUsPhone, skipAgreement);

  const handleServiceToggle = (serviceId: string) => {
    setSelectedServices(prev => 
      prev.includes(serviceId) 
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    // Check if user is authenticated
    if (status === 'loading') {
      setError('Verificando autenticación...');
      setLoading(false);
      return;
    }

    if (status === 'unauthenticated' || !session?.user?.email) {
      setError('Debes iniciar sesión para proceder con el pago.');
      setLoading(false);
      return;
    }

    if (!stripePromise) {
      setError('Stripe no está configurado correctamente. Por favor, recarga la página.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formData,
          selectedServices,
          totalPrice,
          entityType,
          state,
          hasUsAddress,
          hasUsPhone,
          skipAgreement,
        }),
      });

      const result = await response.json();
      
      const { sessionId, paymentLinkUrl, error: sessionError } = result;

      if (sessionError) {
        throw new Error(sessionError);
      }
      
      // Stripe.js redirectToCheckout is removed in API version clover (2025-09-30).
      // Prefer server-provided Checkout Session URL. Fallback to c/pay/:id if needed.
      if (paymentLinkUrl) {
        window.location.href = paymentLinkUrl as string;
        return;
      }
      if (sessionId) {
        window.location.href = `https://checkout.stripe.com/c/pay/${sessionId}`;
        return;
      }
      throw new Error('No session URL or ID received from server');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error');
      setLoading(false);
    }
  };

  const availableServices = SERVICES.filter(service => {
    
    // Show address service only if user doesn't have one
    if (service.id === 'business_address' && hasUsAddress) {
      return false;
    }
    
    // Show phone service only if user doesn't have one
    if (service.id === 'business_phone' && hasUsPhone) {
      return false;
    }
    
    // Show agreement service only if user didn't skip it AND it matches the entity type
    if (service.id === 'operating_agreement') {
      const shouldShow = !skipAgreement && entityType === 'LLC';
      return shouldShow;
    }
    if (service.id === 'shareholder_agreement') {
      const shouldShow = !skipAgreement && entityType === 'C-Corp';
      return shouldShow;
    }
    
    // Show all other services (address, phone, agreement)
    return true;
  });
  

  // Get formation price for display
  const formationPrice = FORMATION_PRICES[entityType]?.[state] || (entityType === 'LLC' ? 60000 : 80000);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Completa tu Pedido</h1>
        <p className="text-gray-600">
          Revisa y personaliza tu paquete de formación de empresa
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Services Selection */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Selecciona Servicios</h2>
          
          {/* Formation Service - Always shown */}
          <div className="border rounded-lg p-4 border-blue-500 bg-blue-50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <h3 className="font-medium text-gray-900">
                    Formación de {entityType} - {state}
                  </h3>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    Requerido
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Formación completa de {entityType} con archivo estatal y documentación
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-gray-900">
                  {formatPrice(formationPrice)}
                </div>
              </div>
            </div>
          </div>
          
          {availableServices.map((service) => (
            <div
              key={service.id}
              className={`border rounded-lg p-4 ${
                selectedServices.includes(service.id) 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200'
              } cursor-pointer hover:border-gray-300`}
              onClick={() => handleServiceToggle(service.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service.id)}
                      onChange={() => handleServiceToggle(service.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <h3 className="font-medium text-gray-900">{service.name}</h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-gray-900">
                    {formatPrice(service.price)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Resumen del Pedido</h2>
          
          <div className="space-y-3 mb-6">
            {/* Formation Service */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Formación de {entityType} - {state}</span>
              <span className="font-medium">{formatPrice(formationPrice)}</span>
            </div>
            
            {selectedServices.map(serviceId => {
              const service = SERVICES.find(s => s.id === serviceId);
              if (!service) return null;
              
              return (
                <div key={serviceId} className="flex justify-between text-sm">
                  <span className="text-gray-600">{service.name}</span>
                  <span className="font-medium">{formatPrice(service.price)}</span>
                </div>
              );
            })}
          </div>
          
          <div className="border-t pt-4">
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
          </div>
          
              <div className="mt-6 space-y-3">
                <button
                  onClick={handleCheckout}
                  disabled={loading || stripeLoading || !stripePromise}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {stripeLoading ? 'Inicializando...' : loading ? 'Procesando...' : 'Proceder al Pago'}
                </button>
            
            <button
              onClick={onCancel}
              className="w-full bg-gray-200 text-gray-800 py-3 px-4 rounded-lg font-medium hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
