"use client";

import { useState } from 'react';
import Checkout from '@/components/Checkout';
import HeroVideo from '@/components/HeroVideo';
import type { StepProps } from './types';

export default function Step10Checkout({ form, setStep, onSave, onNext }: StepProps) {
  const [showCheckout, setShowCheckout] = useState(false);
  const formData = form.getValues();
  
  // Check if user wants agreement based on form data
  const wantsAgreement = formData.admin?.wantAgreement === 'Yes';
  
  // Get the formation state for display
  const formationState = formData.company?.formationState || 'Delaware';

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
        skipAgreement={!wantsAgreement}
      />
    );
  }

  return (
    <section className="space-y-6">
      <HeroVideo title="Completa tu Pedido" />
      
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">¿Listo para Formar tu Empresa?</h2>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-green-900 mb-2">✅ Tu Información está Completa</h3>
          <p className="text-green-800 text-sm">
            Tenemos toda la información necesaria para formar tu empresa. Revisa tu paquete y procede al pago.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">¿Qué está Incluido?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Archivo completo de formación de empresa</li>
              {formData.company?.hasUsaAddress !== 'Yes' && (
                <li>• Dirección comercial en EE. UU. (1 año)</li>
              )}
              {formData.company?.hasUsPhone !== 'Yes' && (
                <li>• Número de teléfono comercial en EE. UU.</li>
              )}
              {wantsAgreement && (
                <li>• Acuerdo Operativo/De Accionistas</li>
              )}
              <li>• Toda la documentación requerida</li>
            </ul>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Tiempo de Procesamiento</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Formación de empresa: 5-7 días hábiles</li>
              {formData.company?.hasUsaAddress !== 'Yes' && (
                <li>• Configuración de dirección: 1-2 días hábiles</li>
              )}
              {formData.company?.hasUsPhone !== 'Yes' && (
                <li>• Configuración de teléfono: 1 día hábil</li>
              )}
              {wantsAgreement && (
                <li>• Documentos legales: 3-5 días hábiles</li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleStartCheckout}
            className="btn btn-primary flex-1"
          >
            Revisar Paquete y Proceder al Pago
          </button>
          
          <button
            onClick={() => setStep(9)}
            className="btn btn-secondary"
          >
            Volver a Revisar
          </button>
        </div>
      </div>

    </section>
  );
}
