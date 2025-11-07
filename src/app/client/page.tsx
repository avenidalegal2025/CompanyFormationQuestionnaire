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

const LATAM_COUNTRIES = [
  { code: '+1', flag: '🇺🇸', name: 'Estados Unidos / Canadá' },
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+53', flag: '🇨🇺', name: 'Cuba' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+509', flag: '🇭🇹', name: 'Haití' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  { code: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: '+51', flag: '🇵🇪', name: 'Perú' },
  { code: '+1', flag: '🇵🇷', name: 'Puerto Rico' },
  { code: '+1809', flag: '🇩🇴', name: 'República Dominicana' },
  { code: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: '+58', flag: '🇻🇪', name: 'Venezuela' },
  { code: '+591', flag: '🇧🇴', name: 'Bolivia' },
  { code: '+34', flag: '🇪🇸', name: 'España' },
];

export default function ClientPage() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [companyData, setCompanyData] = useState<any>(null);
  const [businessPhone, setBusinessPhone] = useState<{ phoneNumber: string; forwardToE164: string } | null>(null);
  const [googleWorkspace, setGoogleWorkspace] = useState<any>(null);
  const [workspaceDomain, setWorkspaceDomain] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [cc, setCc] = useState('+52');
  const [localNum, setLocalNum] = useState('');
  const [showCaller, setShowCaller] = useState(false);
  const [searchCountry, setSearchCountry] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/workspace/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.workspace) {
            setGoogleWorkspace(data.workspace);
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
                    <div className="flex gap-2 items-center">
                      {/* Custom Country Dropdown */}
                      <div className="relative w-[200px]">
                        <button
                          type="button"
                          onClick={() => setShowDropdown(!showDropdown)}
                          className="input w-full text-left flex items-center justify-between"
                        >
                          <span>
                            {LATAM_COUNTRIES.find(c => c.code === cc)?.flag} {cc}
                          </span>
                          <span className="text-gray-400">▼</span>
                        </button>
                        
                        {showDropdown && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setShowDropdown(false)}
                            />
                            <div className="absolute z-20 mt-1 w-[300px] bg-white border border-gray-300 rounded-lg shadow-lg max-h-[300px] overflow-hidden">
                              <div className="p-2 border-b sticky top-0 bg-white">
                                <input
                                  type="text"
                                  placeholder="Buscar país..."
                                  className="input w-full text-sm"
                                  value={searchCountry}
                                  onChange={(e) => setSearchCountry(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="overflow-y-auto max-h-[240px]">
                                {LATAM_COUNTRIES
                                  .filter(country => 
                                    country.name.toLowerCase().includes(searchCountry.toLowerCase()) ||
                                    country.code.includes(searchCountry)
                                  )
                                  .map((country) => (
                                    <button
                                      key={country.code + country.name}
                                      type="button"
                                      className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
                                      onClick={() => {
                                        setCc(country.code);
                                        setShowDropdown(false);
                                        setSearchCountry('');
                                      }}
                                    >
                                      <span className="text-xl">{country.flag}</span>
                                      <span className="text-sm flex-1">{country.name}</span>
                                      <span className="text-sm text-gray-500">{country.code}</span>
                                    </button>
                                  ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <input 
                        type="tel"
                        className="input flex-1 min-w-0" 
                        placeholder="558 918 5576" 
                        value={localNum} 
                        onChange={(e) => setLocalNum(e.target.value)} 
                      />
                      
                      <button
                        className="btn btn-primary whitespace-nowrap"
                        disabled={!localNum}
                        onClick={async () => {
                          try {
                            const resp = await fetch('/api/phone/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forwardToE164: e164 }) });
                            if (resp.ok) {
                              setBusinessPhone({ ...businessPhone, forwardToE164: e164 });
                              setLocalNum('');
                              alert('✅ Número de desvío actualizado correctamente');
                            } else {
                              alert('❌ Error al actualizar. Intenta de nuevo.');
                            }
                          } catch {
                            alert('❌ Error al actualizar. Intenta de nuevo.');
                          }
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

            {/* Google Workspace Card */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google Workspace
                </h3>
              </div>
              
              {googleWorkspace ? (
                <div className="p-6">
                  {/* Workspace Status */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-600">Estado</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        googleWorkspace.status === 'active' ? 'bg-green-100 text-green-800' :
                        googleWorkspace.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {googleWorkspace.status === 'active' ? '✅ Activo' :
                         googleWorkspace.status === 'pending' ? '⏳ Configurando' :
                         '❌ Error'}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mt-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Dominio:</span>
                        <span className="font-mono font-medium text-gray-900">{googleWorkspace.domain}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Email Admin:</span>
                        <span className="font-mono font-medium text-gray-900">{googleWorkspace.adminEmail}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Contraseña:</span>
                        <span className="font-mono font-medium text-gray-900">{googleWorkspace.adminPassword}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Fecha de Expiración:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(googleWorkspace.expiryDate).toLocaleDateString('es-MX')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Links */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <a
                      href={`https://mail.google.com/a/${googleWorkspace.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                      </svg>
                      Abrir Gmail
                    </a>
                    <a
                      href={`https://admin.google.com/ac/overview?domain=${googleWorkspace.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      Admin Console
                    </a>
                  </div>

                  {/* Info Box */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                    <h5 className="text-sm font-semibold text-purple-900 mb-2">📧 Servicios Incluidos</h5>
                    <ul className="text-sm text-purple-800 space-y-1">
                      <li>• <strong>Gmail Profesional:</strong> Correo con tu dominio empresarial</li>
                      <li>• <strong>Google Drive:</strong> 30 GB de almacenamiento en la nube</li>
                      <li>• <strong>Google Meet:</strong> Videoconferencias profesionales</li>
                      <li>• <strong>Docs, Sheets, Slides:</strong> Suite completa de productividad</li>
                    </ul>
                  </div>

                  {/* Management Actions */}
                  <div className="border-t pt-6">
                    <h5 className="text-sm font-semibold text-gray-900 mb-3">Gestionar Suscripción</h5>
                    <div className="flex gap-3">
                      {googleWorkspace.status === 'active' || googleWorkspace.status === 'pending' ? (
                        <>
                          <button
                            onClick={async () => {
                              if (!confirm('¿Estás seguro de que quieres suspender temporalmente este servicio?')) return;
                              try {
                                const res = await fetch('/api/workspace/manage', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'suspend' }),
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  setGoogleWorkspace(data.workspace);
                                  alert('✅ Suscripción suspendida correctamente');
                                } else {
                                  alert('❌ Error al suspender la suscripción');
                                }
                              } catch {
                                alert('❌ Error al procesar la solicitud');
                              }
                            }}
                            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm"
                          >
                            ⏸️ Suspender
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('⚠️ ¿Estás seguro de que quieres cancelar permanentemente este servicio? Esta acción no se puede deshacer.')) return;
                              try {
                                const res = await fetch('/api/workspace/manage', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'cancel' }),
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  setGoogleWorkspace(data.workspace);
                                  alert('✅ Suscripción cancelada correctamente');
                                } else {
                                  alert('❌ Error al cancelar la suscripción');
                                }
                              } catch {
                                alert('❌ Error al procesar la solicitud');
                              }
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                          >
                            ❌ Cancelar
                          </button>
                        </>
                      ) : googleWorkspace.status === 'suspended' ? (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/workspace/manage', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'reactivate' }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setGoogleWorkspace(data.workspace);
                                alert('✅ Suscripción reactivada correctamente');
                              } else {
                                alert('❌ Error al reactivar la suscripción');
                              }
                            } catch {
                              alert('❌ Error al procesar la solicitud');
                            }
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          ▶️ Reactivar
                        </button>
                      ) : (
                        <p className="text-sm text-gray-500">Servicio cancelado - No se puede reactivar</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {googleWorkspace.status === 'active' || googleWorkspace.status === 'pending' 
                        ? '💡 Suspender pausará el servicio temporalmente. Cancelar lo eliminará permanentemente.'
                        : googleWorkspace.status === 'suspended'
                        ? '💡 Puedes reactivar el servicio en cualquier momento.'
                        : '💡 Este servicio ha sido cancelado permanentemente.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  <div className="text-center py-8">
                    <div className="text-6xl mb-4">📧</div>
                    <p className="text-gray-600 text-lg mb-4">¿Necesitas correo profesional?</p>
                    <p className="text-gray-500 text-sm mb-6">
                      Obtén Gmail, Drive, Meet y más con tu dominio empresarial por solo $150/año
                    </p>
                    
                    <div className="max-w-md mx-auto mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                        Ingresa tu dominio empresarial
                      </label>
                      <input
                        type="text"
                        placeholder="ejemplo.com"
                        value={workspaceDomain}
                        onChange={(e) => setWorkspaceDomain(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1 text-left">
                        El dominio donde quieres configurar tu correo profesional
                      </p>
                    </div>
                    
                    <button
                      onClick={async () => {
                        if (!workspaceDomain || !workspaceDomain.includes('.')) {
                          alert('Por favor ingresa un dominio válido (ejemplo: tuempresa.com)');
                          return;
                        }
                        
                        setWorkspaceLoading(true);
                        try {
                          const response = await fetch('/api/workspace/create-checkout-session', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ domain: workspaceDomain }),
                          });
                          
                          if (response.ok) {
                            const data = await response.json();
                            if (data.url) {
                              window.location.href = data.url;
                            }
                          } else {
                            alert('Error al crear la sesión de pago. Intenta de nuevo.');
                          }
                        } catch (error) {
                          alert('Error al procesar la solicitud. Intenta de nuevo.');
                        } finally {
                          setWorkspaceLoading(false);
                        }
                      }}
                      disabled={workspaceLoading || !workspaceDomain}
                      className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {workspaceLoading ? 'Procesando...' : 'Adquirir Google Workspace - $150/año'}
                    </button>
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
