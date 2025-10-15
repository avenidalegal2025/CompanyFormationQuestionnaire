"use client";

import { useState } from 'react';
import { EnvelopeIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface EmailPreferenceStepProps {
  selectedDomains: string[];
  onContinue: (emailPreferences: Record<string, string>) => void;
  onBack: () => void;
}

export default function EmailPreferenceStep({ selectedDomains, onContinue, onBack }: EmailPreferenceStepProps) {
  const [emailPreferences, setEmailPreferences] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateEmail = (email: string): string | null => {
    if (!email.trim()) {
      return 'El email es requerido';
    }
    
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return 'Formato de email inválido';
    }
    
    // For new domains, we assume email addresses are available
    // No need to check availability
    return null;
  };

  const handleEmailChange = (domain: string, email: string) => {
    const localPart = email.split('@')[0] || email;
    const fullEmail = `${localPart}@${domain}`;
    
    setEmailPreferences(prev => ({
      ...prev,
      [domain]: localPart
    }));

    // Clear error for this domain
    if (errors[domain]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[domain];
        return newErrors;
      });
    }
  };

  const handleContinue = () => {
    const newErrors: Record<string, string> = {};
    let hasErrors = false;

    // Validate all email preferences
    selectedDomains.forEach(domain => {
      const email = emailPreferences[domain];
      if (!email) {
        newErrors[domain] = 'El email es requerido';
        hasErrors = true;
      } else {
        const error = validateEmail(`${email}@${domain}`);
        if (error) {
          newErrors[domain] = error;
          hasErrors = true;
        }
      }
    });

    if (hasErrors) {
      setErrors(newErrors);
      return;
    }

    // Convert to full email addresses
    const fullEmailPreferences: Record<string, string> = {};
    selectedDomains.forEach(domain => {
      const localPart = emailPreferences[domain];
      fullEmailPreferences[domain] = `${localPart}@${domain}`;
    });

    onContinue(fullEmailPreferences);
  };

  const getSuggestedEmail = (domain: string) => {
    // Suggest common business email prefixes
    const suggestions = ['info', 'admin', 'contact', 'hello', 'support'];
    return suggestions[0]; // Default to 'info'
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <EnvelopeIcon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Elige tu Email Principal
          </h3>
          <p className="text-gray-600">
            Configura el email principal para cada dominio. Este será tu email de Google Workspace.
          </p>
        </div>

        <div className="space-y-6 mb-8">
          {selectedDomains.map((domain, index) => {
            const currentEmail = emailPreferences[domain] || getSuggestedEmail(domain);
            const hasError = !!errors[domain];
            
            return (
              <div key={domain} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{domain}</h4>
                    <p className="text-sm text-gray-600">Email principal para Google Workspace</p>
                  </div>
                  {emailPreferences[domain] && !hasError && (
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                  )}
                </div>
                
                <div className="flex items-center">
                  <div className="flex-1">
                    <div className="flex">
                      <input
                        type="text"
                        value={currentEmail}
                        onChange={(e) => handleEmailChange(domain, e.target.value)}
                        placeholder="info"
                        className={`flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          hasError ? 'border-red-300' : 'border-gray-300'
                        }`}
                      />
                      <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-600">
                        @{domain}
                      </span>
                    </div>
                    {hasError && (
                      <div className="flex items-center mt-1">
                        <ExclamationTriangleIcon className="h-4 w-4 text-red-500 mr-1" />
                        <span className="text-sm text-red-600">{errors[domain]}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <p className="text-xs text-gray-500">
                    Sugerencias: info, admin, contact, hello, support
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-blue-900 mb-2">¿Qué incluye el email?</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Gmail profesional con tu dominio</li>
            <li>• Google Drive con 15GB de almacenamiento</li>
            <li>• Google Calendar para reuniones</li>
            <li>• Google Meet para videollamadas</li>
            <li>• Acceso desde cualquier dispositivo</li>
          </ul>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onBack}
            className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300"
          >
            Volver
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
          >
            Continuar con la Compra
          </button>
        </div>
      </div>
    </div>
  );
}
