"use client";

import { useState } from 'react';
import Checkout from '@/components/Checkout';
import HeroVideo from '@/components/HeroVideo';
import type { StepProps } from './types';

export default function Step10Checkout({ form, setStep, onSave, onNext }: StepProps) {
  const [showCheckout, setShowCheckout] = useState(false);

  const handleStartCheckout = () => {
    setShowCheckout(true);
  };

  const handleCheckoutSuccess = (sessionId: string) => {
    // Here you would typically save the session ID and redirect
    console.log('Checkout successful:', sessionId);
    // You could redirect to a success page or show a confirmation
  };

  const handleCheckoutCancel = () => {
    setShowCheckout(false);
  };

  if (showCheckout) {
    return (
      <Checkout
        formData={form.getValues()}
        onSuccess={handleCheckoutSuccess}
        onCancel={handleCheckoutCancel}
      />
    );
  }

  return (
    <section className="space-y-6">
      <HeroVideo title="Complete Your Order" />
      
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Ready to Form Your Company?</h2>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-green-900 mb-2">✅ Your Information is Complete</h3>
          <p className="text-green-800 text-sm">
            We have all the information needed to form your company. Review your package and proceed to payment.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">What's Included</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Complete company formation filing</li>
              <li>• US business address (1 year)</li>
              <li>• US business phone number</li>
              <li>• Operating/Shareholder Agreement</li>
              <li>• All required documentation</li>
            </ul>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Processing Time</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Company formation: 5-7 business days</li>
              <li>• Business address setup: 1-2 business days</li>
              <li>• Phone number setup: 1 business day</li>
              <li>• Legal documents: 3-5 business days</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleStartCheckout}
            className="btn btn-primary flex-1"
          >
            Review Package & Checkout
          </button>
          
          <button
            onClick={() => setStep(9)}
            className="btn btn-secondary"
          >
            Back to Review
          </button>
        </div>
      </div>
    </section>
  );
}
