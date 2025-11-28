"use client";

import { useState, useEffect } from 'react';
import ClientNavigation from '@/components/ClientNavigation';
import CompanySwitcher from '@/components/CompanySwitcher';
import VoiceCaller from '@/components/VoiceCaller';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ShoppingBagIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
  GlobeAltIcon,
  PlusIcon
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

// Helper function to check if any owner has SSN
function hasOwnerWithSSN(owners: any[] | undefined): boolean {
  if (!owners || !Array.isArray(owners)) return false;
  return owners.some(owner => owner?.tin && owner.tin.trim() !== '');
}

export default function ClientPage() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [companyData, setCompanyData] = useState<any>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [businessPhone, setBusinessPhone] = useState<{ phoneNumber: string; forwardToE164: string } | null>(null);
  const [hasUsPhone, setHasUsPhone] = useState<boolean>(false);
  const [cc, setCc] = useState('+52');
  const [localNum, setLocalNum] = useState('');
  const [showCaller, setShowCaller] = useState(false);
  const [searchCountry, setSearchCountry] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [processingTime, setProcessingTime] = useState<string>('5-7 días');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const e164 = `${cc}${localNum.replace(/[^\d]/g, '')}`;

  const handleNewCompany = () => {
    // Clear all localStorage data to start fresh
    localStorage.removeItem('questionnaireData');
    localStorage.removeItem('selectedCompanyId');
    // Redirect to questionnaire
    router.push('/');
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    localStorage.setItem('selectedCompanyId', companyId);
    // TODO: Fetch company data from API based on companyId
    // For now, we'll still use localStorage but this should be updated
    // to fetch from Airtable or DynamoDB
    window.location.reload(); // Temporary: reload to refresh data
  };

  useEffect(() => {
    // Get user email from localStorage
    const email = localStorage.getItem('userEmail') || '';
    setUserEmail(email);

    // Get selected company ID from localStorage
    const savedCompanyId = localStorage.getItem('selectedCompanyId');
    if (savedCompanyId) {
      setSelectedCompanyId(savedCompanyId);
    }

    // Get company data from localStorage (for backward compatibility)
    const savedData = localStorage.getItem('questionnaireData');
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        setCompanyData(data);
        
        // Check if user has US phone (if yes, phone section should be hidden)
        const userHasUsPhone = data?.company?.hasUsPhone === 'Yes';
        setHasUsPhone(userHasUsPhone);
        
        // Determine processing time based on owners' SSN
        const owners = data?.owners || [];
        const hasSSN = hasOwnerWithSSN(owners);
        setProcessingTime(hasSSN ? '5-7 días' : '1 mes para tramitar el ITIN con el IRS');
      } catch (error) {
        console.error('Error parsing saved data:', error);
      }
    }

    // Fetch real documents from API
    fetchDocuments();
  }, [selectedCompanyId]);

  const fetchDocuments = async () => {
    try {
      setLoadingDocuments(true);
      const response = await fetch('/api/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      } else {
        console.error('Failed to fetch documents');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoadingDocuments(false);
    }
  };

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
    
    if (!companyName) return 'Mi Empresa';
    
    // Format: "CompanyName EntityType a State company"
    // Example: "Trimaran LLC a Florida company"
    const name = companyName;
    const type = entityType || '';
    const state = formationState || '';
    
    if (state) {
      return `${name} ${type} a ${state} company`.trim();
    } else if (type) {
      return `${name} ${type}`.trim();
    } else {
      return name;
    }
  };

  // Helper function to format document date
  const formatDocumentDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return dateString;
    }
  };

  // Helper function to get document description
  const getDocumentDescription = (doc: any) => {
    const name = doc.name?.toLowerCase() || '';
    if (name.includes('ss-4') || name.includes('ein')) {
      return 'Número de identificación fiscal federal';
    }
    if (name.includes('2848')) {
      return 'Poder notarial para asuntos fiscales';
    }
    if (name.includes('8821')) {
      return 'Autorización para divulgación de información fiscal';
    }
    if (name.includes('artículos') || name.includes('articles')) {
      return 'Documento legal que establece tu empresa';
    }
    if (name.includes('acuerdo') || name.includes('agreement')) {
      return 'Gobierno interno de la empresa';
    }
    if (name.includes('licencia') || name.includes('license')) {
      return 'Permiso para operar en el estado';
    }
    return doc.description || 'Documento de la empresa';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'signed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'processing':
      case 'generated':
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
      case 'signed':
        return 'Completado';
      case 'processing':
      case 'generated':
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
      case 'signed':
        return 'text-green-600 bg-green-100';
      case 'processing':
      case 'generated':
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
          <header className="bg-white border-b border-gray-200">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-20">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                  <p className="text-sm text-gray-600 mt-1">{getCompanyDisplayName()}</p>
                </div>
                <div className="flex items-center space-x-4">
                  {userEmail && (
                    <CompanySwitcher
                      userEmail={userEmail}
                      selectedCompanyId={selectedCompanyId}
                      onCompanyChange={handleCompanyChange}
                    />
                  )}
                  <button
                    onClick={handleNewCompany}
                    className="btn btn-primary flex items-center space-x-2"
                  >
                    <PlusIcon className="h-5 w-5" />
                    <span>Formar Empresa</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Welcome Section */}
            <div className="card">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                ¡Bienvenido a tu Hub Empresarial!
              </h2>
              <p className="text-gray-600 text-base">
                Aquí puedes gestionar todos los documentos de tu empresa y acceder a servicios adicionales.
              </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className="h-8 w-8 text-green-500" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Pago Completado</h3>
                    <p className="text-sm text-gray-600">Tu pago ha sido procesado exitosamente</p>
                  </div>
                </div>
              </div>
              
              <div className="card">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <DocumentTextIcon className="h-8 w-8 text-brand-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Documentos en Proceso</h3>
                    <p className="text-sm text-gray-600">Preparando tu documentación</p>
                  </div>
                </div>
              </div>
              
              <div className="card">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <ClockIcon className="h-8 w-8 text-brand-500" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Tiempo de procesamiento</h3>
                    <p className="text-sm text-gray-600">{processingTime}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Business Phone Card - Only show if user doesn't have US phone */}
            {!hasUsPhone && (
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-5">
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
                      className="w-full btn btn-primary py-4 text-lg font-semibold flex items-center justify-center gap-3"
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
                  <div className="mt-6 bg-brand-50 border border-brand-200 rounded-xl2 p-4">
                    <h5 className="text-sm font-semibold text-brand-900 mb-2">💡 Cómo usar tu número</h5>
                    <ul className="text-sm text-brand-800 space-y-1">
                      <li>• <strong>Llamadas entrantes:</strong> Se reenvían automáticamente al número configurado</li>
                      <li>• <strong>Llamadas salientes:</strong> Usa el botón de arriba para llamar desde tu navegador</li>
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
            )}

            {/* Voice Caller Modal */}
            {showCaller && businessPhone && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <VoiceCaller onClose={() => setShowCaller(false)} />
              </div>
            )}

            {/* Recent Documents */}
            <div className="card">
              <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">Documentos Recientes</h3>
              </div>
              {loadingDocuments ? (
                <div className="px-6 py-12 text-center text-gray-500">
                  <ClockIcon className="h-8 w-8 mx-auto mb-2 animate-spin text-brand-500" />
                  <p className="text-sm">Cargando documentos...</p>
                </div>
              ) : documents.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500">
                  <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-sm">No hay documentos disponibles aún.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {documents.slice(0, 5).map((doc) => (
                    <div key={doc.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {getStatusIcon(doc.status)}
                          <div className="ml-3">
                            <h4 className="text-base font-medium text-gray-900">{doc.name}</h4>
                            <p className="text-sm text-gray-600 mt-0.5">{getDocumentDescription(doc)}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                            {getStatusText(doc.status)}
                          </span>
                          <span className="text-sm text-gray-500">{formatDocumentDate(doc.createdAt || doc.date)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Link
                href="/client/documents"
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <DocumentTextIcon className="h-8 w-8 text-brand-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-semibold text-gray-900">Gestionar Documentos</h3>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  Revisa, descarga y gestiona todos los documentos de tu empresa.
                </p>
              </Link>

              <Link
                href="/client/domains"
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <GlobeAltIcon className="h-8 w-8 text-brand-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-semibold text-gray-900">Gestionar Dominios</h3>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  Busca, compra y gestiona dominios para tu empresa.
                </p>
              </Link>

              <Link
                href="/client/services"
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <ShoppingBagIcon className="h-8 w-8 text-brand-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-semibold text-gray-900">Servicios Adicionales</h3>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
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
