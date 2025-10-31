"use client";

import { useState, useEffect } from 'react';
import ClientNavigation from '@/components/ClientNavigation';
import VoiceCaller from '@/components/VoiceCaller';
import Link from 'next/link';
import {
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ShoppingBagIcon,
  ExclamationTriangleIcon,
  PhoneIcon
} from '@heroicons/react/24/outline';

export default function ClientPage() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [companyData, setCompanyData] = useState<any>(null);
  const [businessPhone, setBusinessPhone] = useState<{ phoneNumber: string; forwardToE164: string } | null>(null);
  const [cc, setCc] = useState('+1');
  const [localNum, setLocalNum] = useState('');
  const [showCaller, setShowCaller] = useState(false);
  const e164 = `${cc}${localNum.replace(/[^\d]/g, '')}`;

  useEffect(() => {
    // Get company data from localStorage
    const savedData = localStorage.getItem('questionnaireData');
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        setCompanyData(data);
      } catch (error) {
        console.error('Error parsing saved data:', error);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/phone/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.phone) {
            setBusinessPhone({ phoneNumber: data.phone.phoneNumber, forwardToE164: data.phone.forwardToE164 });
          }
        }
      } catch {}
    })();
  }, []);

  const getCompanyDisplayName = () => {
    if (!companyData?.company) return 'Mi Empresa';
    
    const { companyName, entityType, formationState } = companyData.company;
    const name = companyName || 'Mi Empresa';
    const type = entityType || '';
    const state = formationState || '';
    
    return `${name} ${type} ${state}`.trim();
  };

  const documents = [
    {
      id: 'articles-of-incorporation',
      name: 'Artículos de Incorporación',
      status: 'completed',
      description: 'Documento legal que establece tu empresa',
      date: '2024-01-15'
    },
    {
      id: 'ein-certificate',
      name: 'Certificado EIN',
      status: 'processing',
      description: 'Número de identificación fiscal federal',
      date: '2024-01-16'
    },
    {
      id: 'operating-agreement',
      name: 'Acuerdo Operativo',
      status: 'pending',
      description: 'Gobierno interno de la empresa',
      date: '2024-01-20'
    },
    {
      id: 'business-license',
      name: 'Licencia Comercial',
      status: 'pending',
      description: 'Permiso para operar en el estado',
      date: '2024-01-22'
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <ClockIcon className="h-5 w-5 text-blue-500" />;
      case 'pending':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completado';
      case 'processing':
        return 'En Proceso';
      case 'pending':
        return 'Pendiente';
      default:
        return 'Desconocido';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'processing':
        return 'text-blue-600 bg-blue-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <ClientNavigation currentTab={currentTab} onTabChange={setCurrentTab} />

        {/* Main Content */}
        <div className="flex-1 lg:ml-64">
          {/* Header */}
          <header className="bg-white shadow-sm border-b">
            <div className="px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                  <p className="text-sm text-gray-600">{getCompanyDisplayName()}</p>
                </div>
                <div className="flex items-center space-x-4">
                  <Link
                    href="/"
                    className="text-gray-600 hover:text-gray-900 text-sm"
                  >
                    Volver al Cuestionario
                  </Link>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="px-4 sm:px-6 lg:px-8 py-8">
            {/* Welcome Section */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                ¡Bienvenido a tu Hub Empresarial!
              </h2>
              <p className="text-gray-600">
                Aquí puedes gestionar todos los documentos de tu empresa y acceder a servicios adicionales.
              </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <div className="text-green-600 text-2xl mr-3">✅</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Pago Completado</h3>
                    <p className="text-gray-600">Tu pago ha sido procesado exitosamente</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <div className="text-blue-600 text-2xl mr-3">📋</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Documentos en Proceso</h3>
                    <p className="text-gray-600">Preparando tu documentación</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <div className="text-purple-600 text-2xl mr-3">🚀</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Listo en 5-7 días</h3>
                    <p className="text-gray-600">Recibirás todo por email</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Business Phone Card */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                  <PhoneIcon className="h-6 w-6" />
                  Número de Teléfono Empresarial
                </h3>
              </div>
              
              {businessPhone ? (
                <div className="p-6">
                  {/* Phone Number Display */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-600">Tu número de EE. UU.</span>
                      <span className="text-2xl font-bold text-gray-900 font-mono">{businessPhone.phoneNumber}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Desvío configurado a</span>
                      <span className="text-lg font-semibold text-blue-600 font-mono">{businessPhone.forwardToE164}</span>
                    </div>
                  </div>

                  {/* Call Button */}
                  <div className="mb-6">
                    <button
                      onClick={() => setShowCaller(true)}
                      className="w-full btn bg-green-600 hover:bg-green-700 text-white py-4 text-lg font-semibold flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all"
                    >
                      <PhoneIcon className="h-6 w-6" />
                      Realizar Llamada Saliente
                    </button>
                  </div>

                  {/* Update Forwarding Section */}
                  <div className="border-t pt-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Actualizar Número de Desvío</h4>
                    <div className="flex gap-2 items-start">
                      <select className="input w-[140px]" value={cc} onChange={(e) => setCc(e.target.value)}>
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+52">🇲🇽 +52</option>
                        <option value="+57">🇨🇴 +57</option>
                        <option value="+34">🇪🇸 +34</option>
                        <option value="+51">🇵🇪 +51</option>
                      </select>
                      <input 
                        className="input flex-1" 
                        placeholder="Número de destino" 
                        value={localNum} 
                        onChange={(e) => setLocalNum(e.target.value)} 
                      />
                      <button
                        className="btn btn-primary whitespace-nowrap"
                        onClick={async () => {
                          try {
                            const resp = await fetch('/api/phone/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forwardToE164: e164 }) });
                            if (resp.ok) {
                              setBusinessPhone({ ...businessPhone, forwardToE164: e164 });
                              setLocalNum('');
                            }
                          } catch {}
                        }}
                      >
                        Actualizar
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Las llamadas entrantes a tu número de EE. UU. se redirigirán automáticamente a este número.
                    </p>
                  </div>

                  {/* Info Box */}
                  <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h5 className="text-sm font-semibold text-blue-900 mb-2">💡 Cómo usar tu número</h5>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• <strong>Llamadas entrantes:</strong> Se reenvían automáticamente al número configurado</li>
                      <li>• <strong>Llamadas salientes:</strong> Usa el botón verde de arriba para llamar desde tu navegador</li>
                      <li>• <strong>Prueba:</strong> Llama a tu número desde cualquier teléfono para verificar el desvío</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  <div className="text-center py-8">
                    <div className="text-6xl mb-4">📞</div>
                    <p className="text-gray-600 text-lg">Aún no se ha asignado un número.</p>
                    <p className="text-gray-500 text-sm mt-2">Se asignará automáticamente después del pago.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Voice Caller Modal */}
            {showCaller && businessPhone && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <VoiceCaller onClose={() => setShowCaller(false)} />
              </div>
            )}

            {/* Recent Documents */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Documentos Recientes</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {documents.map((doc) => (
                  <div key={doc.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {getStatusIcon(doc.status)}
                        <div className="ml-3">
                          <h4 className="text-sm font-medium text-gray-900">{doc.name}</h4>
                          <p className="text-sm text-gray-600">{doc.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                          {getStatusText(doc.status)}
                        </span>
                        <span className="text-sm text-gray-500">{doc.date}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <Link
                href="/client/documents"
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <DocumentTextIcon className="h-8 w-8 text-blue-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">Gestionar Documentos</h3>
                </div>
                <p className="text-gray-600">
                  Revisa, descarga y gestiona todos los documentos de tu empresa.
                </p>
              </Link>

              <Link
                href="/client/domains"
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <div className="text-2xl mr-3">🌐</div>
                  <h3 className="text-lg font-semibold text-gray-900">Gestionar Dominios</h3>
                </div>
                <p className="text-gray-600">
                  Busca, compra y gestiona dominios para tu empresa.
                </p>
              </Link>

              <Link
                href="/client/services"
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <ShoppingBagIcon className="h-8 w-8 text-green-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">Servicios Adicionales</h3>
                </div>
                <p className="text-gray-600">
                  Descubre servicios complementarios para hacer crecer tu negocio.
                </p>
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
