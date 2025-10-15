"use client";

import { useState } from 'react';
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline';

interface DomainResult {
  domain: string;
  available: boolean;
  price?: number;
  currency?: string;
  registrationPeriod?: number;
  renewalPrice?: number;
}

interface DomainPurchaseProps {
  selectedDomains: string[];
  // Optional map of domain -> price (already includes markup, per UI cards)
  domainPrices?: Record<string, number>;
  onPurchase: (domains: string[]) => Promise<void>;
  onCancel: () => void;
}

export default function DomainPurchase({ selectedDomains, domainPrices, onPurchase, onCancel }: DomainPurchaseProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState<'confirm' | 'processing' | 'success' | 'error'>('confirm');

  const handlePurchase = async () => {
    setIsProcessing(true);
    setPurchaseStep('processing');
    
    try {
      await onPurchase(selectedDomains);
      // Don't set to success here - let the parent handle success after Stripe return
      // The parent will redirect to Stripe checkout, so we just close the modal
      onCancel();
    } catch (error) {
      console.error('Purchase error:', error);
      setPurchaseStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getTotalPrice = () => {
    return selectedDomains.reduce((sum, d) => sum + (domainPrices?.[d] ?? 0), 0);
  };

  if (purchaseStep === 'success') {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ¡Dominios Comprados Exitosamente!
            </h3>
            <p className="text-gray-600 mb-6">
              Tus dominios han sido registrados y están siendo configurados.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (purchaseStep === 'error') {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Error en la Compra
            </h3>
            <p className="text-gray-600 mb-6">
              Hubo un problema al procesar tu compra. Por favor, inténtalo de nuevo.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setPurchaseStep('confirm')}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300"
              >
                Reintentar
              </button>
              <button
                onClick={onCancel}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (purchaseStep === 'processing') {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Procesando Compra...
            </h3>
            <p className="text-gray-600">
              Estamos registrando tus dominios. Esto puede tomar unos minutos.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-lg w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">
          Confirmar Compra de Dominios
        </h3>
        
        <div className="space-y-4 mb-6">
          <h4 className="font-medium text-gray-900">Dominios seleccionados:</h4>
          <div className="bg-gray-50 rounded-lg p-4">
            {selectedDomains.map((domain, index) => (
              <div key={index} className="flex items-center justify-between py-2">
                <span className="text-gray-900">{domain}</span>
                <span className="text-sm text-gray-600">
                  {domainPrices?.[domain] != null ? `$${domainPrices[domain].toFixed(2)}/año` : '...'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-900">Total:</span>
            <span className="text-lg font-semibold text-gray-900">
              ${getTotalPrice().toFixed(2)}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">Pago anual • Auto‑renovación desactivada</p>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-blue-900 mb-2">¿Qué incluye?</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Registro del dominio por 1 año</li>
            <li>• Configuración DNS básica</li>
            <li>• Protección de privacidad</li>
            <li>• Soporte técnico 24/7</li>
            <li>• Gestión desde tu hub empresarial</li>
          </ul>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300"
            disabled={isProcessing}
          >
            Cancelar
          </button>
          <button
            onClick={handlePurchase}
            disabled={isProcessing}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? 'Procesando...' : 'Comprar Dominios'}
          </button>
        </div>
      </div>
    </div>
  );
}





