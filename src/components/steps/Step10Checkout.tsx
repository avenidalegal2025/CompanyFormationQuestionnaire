"use client";

import { useState } from 'react';
import Checkout from '@/components/Checkout';
import HeroVideo from '@/components/HeroVideo';
import type { StepProps } from './types';

export default function Step10Checkout({ form, setStep, onSave, onNext }: StepProps) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [skipAgreement, setSkipAgreement] = useState(false);

  const handleStartCheckout = () => {
    setShowCheckout(true);
  };

  const handleSkipAgreement = () => {
    setSkipAgreement(true);
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
        skipAgreement={skipAgreement}
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
              <li>• Dirección comercial en EE. UU. (1 año)</li>
              <li>• Número de teléfono comercial en EE. UU.</li>
              <li>• Acuerdo Operativo/De Accionistas</li>
              <li>• Toda la documentación requerida</li>
            </ul>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Tiempo de Procesamiento</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Formación de empresa: 5-7 días hábiles</li>
              <li>• Configuración de dirección: 1-2 días hábiles</li>
              <li>• Configuración de teléfono: 1 día hábil</li>
              <li>• Documentos legales: 3-5 días hábiles</li>
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

      {/* Modal for Agreement Recommendation */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md mx-4">
          <div className="flex items-center mb-4">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold mr-3">
              A
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Avenida Legal</h3>
            <button 
              onClick={() => setShowCheckout(false)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          
          <p className="font-semibold text-gray-900 mb-4">
            Antes de continuar, te recomendamos altamente que también tengas un Acuerdo de Accionistas.
          </p>
          
          <p className="text-sm text-gray-600 mb-2">¿Por qué es tan importante?</p>
          <p className="text-sm text-gray-700 mb-4">
            Podría salvar tu empresa si las cosas no quedan bien claras desde el principio, ahorrar cientos de miles de dólares en litigios entre socios.
          </p>
          <p className="text-sm text-blue-600 underline mb-4">
            Leer nuestro artículo que te explica al detalle
          </p>
          
          <p className="text-sm text-gray-700 mb-6">
            Inversión asociada: $600 USD.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={handleStartCheckout}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700"
            >
              Lo quiero
            </button>
            <button
              onClick={handleSkipAgreement}
              className="w-full text-sm text-gray-600 underline hover:text-gray-800"
            >
              Quiero continuar con el alto riesgo que esto conlleva
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
