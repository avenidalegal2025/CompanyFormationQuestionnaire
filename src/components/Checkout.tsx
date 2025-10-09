"use client";

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { SERVICES, PACKAGES, calculateTotalPrice, formatPrice } from '@/lib/pricing';
import type { AllSteps } from '@/lib/schema';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutProps {
  formData: AllSteps;
  onSuccess: (sessionId: string) => void;
  onCancel: () => void;
}

export default function Checkout({ formData, onSuccess, onCancel }: CheckoutProps) {
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entityType = formData.company?.entityType as 'LLC' | 'C-Corp';
  const formationService = entityType === 'LLC' ? 'llc_formation' : 'corp_formation';

  // Auto-select formation service and recommended services
  useEffect(() => {
    const recommended = [formationService];
    
    // Auto-select business address for all packages
    recommended.push('business_address');
    
    // Auto-select agreement based on entity type
    if (entityType === 'LLC') {
      recommended.push('operating_agreement');
    } else {
      recommended.push('shareholder_agreement');
    }
    
    setSelectedServices(recommended);
  }, [entityType, formationService]);

  const totalPrice = calculateTotalPrice(selectedServices, entityType);

  const handleServiceToggle = (serviceId: string) => {
    // Formation service is always required
    if (serviceId === formationService) return;
    
    setSelectedServices(prev => 
      prev.includes(serviceId) 
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

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
        }),
      });

      const { sessionId, error: sessionError } = await response.json();

      if (sessionError) {
        throw new Error(sessionError);
      }

      // Redirect to Stripe Checkout
      window.location.href = `https://checkout.stripe.com/pay/${sessionId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const availableServices = SERVICES.filter(service => {
    // Show formation service for current entity type
    if (service.id === formationService) return true;
    
    // Show agreement service for current entity type
    if (entityType === 'LLC' && service.id === 'operating_agreement') return true;
    if (entityType === 'C-Corp' && service.id === 'shareholder_agreement') return true;
    
    // Show other services
    if (service.category === 'address' || service.category === 'phone') return true;
    
    return false;
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Complete Your Order</h1>
        <p className="text-gray-600">
          Review and customize your company formation package
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Services Selection */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Select Services</h2>
          
          {availableServices.map((service) => (
            <div
              key={service.id}
              className={`border rounded-lg p-4 ${
                selectedServices.includes(service.id) 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200'
              } ${service.required ? 'opacity-75' : 'cursor-pointer hover:border-gray-300'}`}
              onClick={() => !service.required && handleServiceToggle(service.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service.id)}
                      onChange={() => !service.required && handleServiceToggle(service.id)}
                      disabled={service.required}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <h3 className="font-medium text-gray-900">{service.name}</h3>
                    {service.required && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        Required
                      </span>
                    )}
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
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Summary</h2>
          
          <div className="space-y-3 mb-6">
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
              disabled={loading || selectedServices.length === 0}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Proceed to Payment'}
            </button>
            
            <button
              onClick={onCancel}
              className="w-full bg-gray-200 text-gray-800 py-3 px-4 rounded-lg font-medium hover:bg-gray-300"
            >
              Cancel
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
