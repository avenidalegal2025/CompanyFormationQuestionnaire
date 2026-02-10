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
  PlusIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/outline';
import { getDocumentTypeDisplayName } from '@/lib/document-names';

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
  const [companies, setCompanies] = useState<any[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [businessPhone, setBusinessPhone] = useState<{ phoneNumber: string; forwardToE164: string } | null>(null);
  const [hasUsPhone, setHasUsPhone] = useState<boolean>(true); // Default to true = hide phone section
  const [needsUsPhoneFromAvenida, setNeedsUsPhoneFromAvenida] = useState<boolean>(false);
  const [cc, setCc] = useState('+52');
  const [localNum, setLocalNum] = useState('');
  const [showCaller, setShowCaller] = useState(false);
  const [searchCountry, setSearchCountry] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [processingTime, setProcessingTime] = useState<string>('5-7 días');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [downloadedDocs, setDownloadedDocs] = useState<Set<string>>(new Set());
  const e164 = `${cc}${localNum.replace(/[^\d]/g, '')}`;

  // If the user arrived here right after signing up from the questionnaire,
  // redirect them back to the questionnaire flow instead of keeping them
  // in the dashboard. We use the authCallbackUrl marker that
  // Step components write before sending the user to Auth0.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const callback = localStorage.getItem('authCallbackUrl');
    if (callback) {
      localStorage.removeItem('authCallbackUrl');
      router.push(callback);
    }
  }, [router]);

  const handleNewCompany = () => {
    // Clear ALL localStorage data to start completely fresh
    localStorage.removeItem('questionnaireData');
    localStorage.removeItem('selectedCompanyId');
    localStorage.removeItem('draftId');
    localStorage.removeItem('anonymousDraftId');
    localStorage.removeItem('anonymousDraftData');
    localStorage.removeItem('collabData');
    localStorage.removeItem('collabDraftId');
    localStorage.removeItem('paymentCompleted');
    // Set flag to indicate new company creation
    localStorage.setItem('newCompany', 'true');
    // Redirect to questionnaire with a flag to indicate new company
    router.push('/?newCompany=true');
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    localStorage.setItem('selectedCompanyId', companyId);
    // Only mark as user-selected if userSelectedCompanyId is NOT already cleared
    // This allows programmatic selection (from selectNewest) to work without marking as user-selected
    const currentUserSelected = localStorage.getItem('userSelectedCompanyId');
    if (currentUserSelected !== null) {
      // User manually changed company - mark as user-selected
      localStorage.setItem('userSelectedCompanyId', companyId);
    }
    // TODO: Fetch company data from API based on companyId
    // For now, we'll still use localStorage but this should be updated
    // to fetch from Airtable or DynamoDB
    window.location.reload(); // Temporary: reload to refresh data
  };

  useEffect(() => {
    // CRITICAL: Check paymentCompleted FIRST before anything else
    // This ensures newest company is selected after payment
    const paymentCompleted = localStorage.getItem('paymentCompleted');
    
    if (paymentCompleted === 'true') {
      // Payment just completed - IMMEDIATELY clear ALL selection state
      console.log('💳 Payment completed - IMMEDIATELY clearing ALL company selection state');
      localStorage.removeItem('selectedCompanyId');
      localStorage.removeItem('userSelectedCompanyId');
      setSelectedCompanyId(null);
      // Keep paymentCompleted flag for CompanySwitcher to detect
      // Don't proceed with any other logic - let CompanySwitcher handle selection
      return;
    }
    
    // Only set from localStorage if payment was NOT just completed
    // and user explicitly selected a company (not auto-selected)
    const userSelectedCompanyId = localStorage.getItem('userSelectedCompanyId');
    const savedCompanyId = localStorage.getItem('selectedCompanyId');
    
    // Only use savedCompanyId if user explicitly selected it
    if (savedCompanyId && userSelectedCompanyId === savedCompanyId) {
      setSelectedCompanyId(savedCompanyId);
      console.log('👤 User explicitly selected company, keeping selection:', savedCompanyId);
    } else {
      // No explicit user selection - let CompanySwitcher select newest
      setSelectedCompanyId(null);
      console.log('🔄 No explicit user selection - setting selectedCompanyId to null for auto-selection');
    }

    // Get company data from localStorage (for backward compatibility)
    const savedData = localStorage.getItem('questionnaireData');
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        setCompanyData(data);
        
        // Check if user has US phone
        const userHasUsPhone = data?.company?.hasUsPhone === 'Yes';
        setHasUsPhone(userHasUsPhone);
        
        // Only show phone section if user explicitly said they DON'T have a US phone
        // This means they need one from Avenida Legal
        const needsPhone = data?.company?.hasUsPhone === 'No';
        setNeedsUsPhoneFromAvenida(needsPhone);
        
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
  }, []); // Only run once on mount - don't re-run when selectedCompanyId changes

  // Fetch userEmail and companies on mount
  useEffect(() => {
    const email = localStorage.getItem('userEmail') || '';
    setUserEmail(email);
    if (email) {
      fetchAllCompanies();
    }
  }, []);

  // Refetch companies when userEmail changes (e.g., after payment)
  useEffect(() => {
    if (userEmail) {
      fetchAllCompanies();
      // Check if payment was just completed
      const checkPaymentCompleted = localStorage.getItem('paymentCompleted');
      if (checkPaymentCompleted === 'true') {
        // Wait a bit for webhook to process and create the Airtable record
        // The CompanySwitcher will automatically select the newest company
        setTimeout(() => {
          // Don't clear paymentCompleted here - let CompanySwitcher handle it
          // This ensures the newest company is selected
          console.log('💳 Payment completed, waiting for new company to appear...');
          fetchAllCompanies();
        }, 3000);
      }
    }
  }, [userEmail]);

  const fetchAllCompanies = async () => {
    if (!userEmail) return;
    try {
      setLoadingCompanies(true);
      const response = await fetch(`/api/companies?email=${encodeURIComponent(userEmail)}`);
      if (response.ok) {
        const data = await response.json();
        setCompanies(data.companies || []);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const fetchCompanyData = async () => {
    try {
      const selectedCompanyId = localStorage.getItem('selectedCompanyId');
      if (!selectedCompanyId) {
        console.log('⚠️ No selectedCompanyId found');
        return;
      }
      
      const response = await fetch(`/api/companies?companyId=${encodeURIComponent(selectedCompanyId)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.company) {
          // Set company data in the format expected by the component
          setCompanyData({
            company: {
              companyName: data.company.companyName,
              entityType: data.company.entityType, // From Airtable Entity Type column
              formationState: data.company.formationState,
            }
          });
          console.log('✅ Fetched company data from Airtable:', data.company);
        }
      } else {
        console.error('Failed to fetch company data from Airtable');
      }
    } catch (error) {
      console.error('Error fetching company data:', error);
    }
  };

  const fetchDocuments = async () => {
    try {
      setLoadingDocuments(true);
      // Important: always request documents for the currently selected company
      const companyIdForDocs = selectedCompanyId || localStorage.getItem('selectedCompanyId') || undefined;
      const query = companyIdForDocs ? `?companyId=${encodeURIComponent(companyIdForDocs)}` : '';
      const response = await fetch(`/api/documents${query}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      } else {
        console.error('Failed to fetch documents');
      }
      // Also fetch company data from Airtable (uses same selectedCompanyId)
      await fetchCompanyData();
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoadingDocuments(false);
    }
  };

  // Categorize documents into three states (aligned with /client/documents)
  const categorizeDocument = (doc: any) => {
    const docIdLower = (doc.id || '').toLowerCase();

    // EIN + Articles uploaded by Avenida's lawyer should appear as "Completado"
    if (docIdLower === 'ein-letter' || docIdLower === 'articles-inc' || docIdLower === 'articles-llc') {
      return 'firmado';
    }

    // Firmado: has signedS3Key OR status is 'signed'
    if (doc.signedS3Key || doc.status === 'signed') {
      return 'firmado';
    }
    
    // Documents that should be in "por-firmar" (even if status is 'template')
    // These are documents that users need to download, sign, and upload
    const docName = (doc.name || '').toLowerCase();
    const docId = docIdLower;
    const isFormationDoc = docName.includes('membership registry') || 
                           docName.includes('shareholder registry') ||
                           docName.includes('organizational resolution') || 
                           docName.includes('shareholder agreement') ||
                           docName.includes('operating agreement') ||
                           docName.includes('bylaws') ||
                           docId === 'membership-registry' ||
                           docId === 'shareholder-registry' ||
                           docId === 'bylaws';
    
    // If it's a formation document, it should be in "por-firmar" (unless already signed)
    // This includes documents with status 'template' that need user action
    if (isFormationDoc) {
      return 'por-firmar';
    }
    
    // Por firmar: status is 'generated' or 'pending_signature' (needs user action)
    if (doc.status === 'generated' || doc.status === 'pending_signature') {
      return 'por-firmar';
    }
    
    // En proceso: status is 'template' or 'processing' (nothing for user to do)
    // Only for documents that are NOT formation documents
    if (doc.status === 'template' || doc.status === 'processing') {
      return 'en-proceso';
    }
    
    // Default to 'por-firmar' for any other unknown statuses
    return 'por-firmar';
  };

  const handleDownload = async (documentId: string) => {
    try {
      const companyIdForDocs = selectedCompanyId || localStorage.getItem('selectedCompanyId') || undefined;
      const companyQuery = companyIdForDocs ? `&companyId=${encodeURIComponent(companyIdForDocs)}` : '';
      const viewUrl = `/api/documents/view?id=${encodeURIComponent(documentId)}${companyQuery}`;
      window.open(viewUrl, '_blank');
      setDownloadedDocs(prev => new Set(prev).add(documentId));
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('Error al descargar el documento. Por favor, intenta de nuevo.');
    }
  };

  const handleUploadSigned = async (documentId: string, file: File) => {
    try {
      setUploading(prev => ({ ...prev, [documentId]: true }));

      const formData = new FormData();
      formData.append('documentId', documentId);
      formData.append('file', file);
      const companyIdForDocs = selectedCompanyId || localStorage.getItem('selectedCompanyId');
      if (companyIdForDocs) {
        formData.append('companyId', companyIdForDocs);
      }

      const response = await fetch('/api/documents/upload-signed', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload signed document');
      }

      const result = await response.json();
      
      setDocuments(prev => prev.map(doc => 
        doc.id === documentId 
          ? { ...doc, ...result.document }
          : doc
      ));

      alert('Documento firmado subido exitosamente.');
      await fetchDocuments();
    } catch (error: any) {
      console.error('Error uploading signed document:', error);
      alert(`Error al subir el documento firmado: ${error.message}`);
    } finally {
      setUploading(prev => ({ ...prev, [documentId]: false }));
    }
  };

  const handleFileSelect = (documentId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        alert('Por favor, sube un archivo PDF.');
        return;
      }
      handleUploadSigned(documentId, file);
    }
    event.target.value = '';
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
    
    const { companyName, formationState } = companyData.company;
    
    if (!companyName) return 'Mi Empresa';
    
    // Use full company name including entity type (e.g., "BEBE Corp a Florida company")
    const state = formationState || '';
    
    if (state) {
      return `${companyName} a ${state} company`.trim();
    } else {
      return companyName;
    }
  };

  const getEntityType = () => {
    if (!companyData?.company) return '';
    return (companyData.company.entityType || '').toLowerCase();
  };

  const isCorporation = () => {
    const entityType = getEntityType();
    return entityType.includes('corp') || entityType.includes('inc') || entityType.includes('corporation');
  };

  const isLLC = () => {
    const entityType = getEntityType();
    return entityType.includes('llc') || entityType.includes('limited liability');
  };

  const getArticlesLabel = () => {
    if (isCorporation()) return 'Articles of Incorporation';
    if (isLLC()) return 'Articles of Organization';
    return 'documento de formación estatal';
  };

  // Helper to check if a document exists
  const hasDoc = (docId: string) => {
    return documents.some(doc => {
      const docIdLower = (doc.id || '').toLowerCase();
      const docNameLower = (doc.name || '').toLowerCase();
      const searchId = docId.toLowerCase();
      return (docIdLower === searchId || docNameLower.includes(searchId)) &&
             (doc.s3Key || doc.signedS3Key); // Must have uploaded document
    });
  };

  const hasEin = hasDoc('ein-letter');
  const hasArticlesInc = hasDoc('articles-inc');
  const hasArticlesLlc = hasDoc('articles-llc');

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
          <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                  <p className="text-sm text-gray-600 mt-1 truncate" title={getCompanyDisplayName()}>
                    {getCompanyDisplayName()}
                  </p>
                </div>
                <div className="flex items-center space-x-4 flex-shrink-0">
                  {userEmail && companies.length > 1 && !loadingCompanies && (
                    <CompanySwitcher
                      userEmail={userEmail}
                      selectedCompanyId={selectedCompanyId}
                      onCompanyChange={handleCompanyChange}
                    />
                  )}
                  <button
                    onClick={handleNewCompany}
                    className="btn btn-primary whitespace-nowrap"
                  >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Formar Empresa
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Documents that need signing */}
              <Link href="/client/documents?tab=por-firmar" className="card hover:shadow-lg transition-shadow cursor-pointer block w-full h-full">
                <div className="flex items-start w-full">
                  <div className="flex-shrink-0">
                    <DocumentTextIcon className="h-8 w-8 text-orange-500" />
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Documentos por Firmar
                    </h3>
                    <p className="text-2xl font-bold text-orange-600 mb-1">
                      {documents.filter(doc => categorizeDocument(doc) === 'por-firmar').length}
                    </p>
                    <p className="text-sm text-gray-600">
                      {documents.filter(doc => categorizeDocument(doc) === 'por-firmar').length === 0
                        ? 'Todos los documentos están firmados'
                        : 'Requieren tu firma para continuar'}
                    </p>
                  </div>
                </div>
              </Link>

              {/* En Proceso Card with Numbered List */}
              {(() => {
                const showEin = !hasEin;
                const showArticlesInc = isCorporation() && !hasArticlesInc;
                const showArticlesLlc = isLLC() && !hasArticlesLlc;
                const showCard = showEin || showArticlesInc || showArticlesLlc;
                
                console.log('🔍 Dashboard En Proceso Card Debug:', {
                  showEin,
                  showArticlesInc,
                  showArticlesLlc,
                  showCard,
                  hasEin,
                  hasArticlesInc,
                  hasArticlesLlc,
                  isCorp: isCorporation(),
                  isLLC: isLLC(),
                  entityType: getEntityType(),
                  companyData: companyData?.company
                });
                
                if (!showCard) return null;
                
                return (
                  <div className="card border-l-4 border-l-blue-500">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <ClockIcon className="h-8 w-8 text-blue-500" />
                      </div>
                      <div className="ml-4 flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">
                          En Proceso
                        </h3>
                        <ol className="space-y-2 text-sm text-gray-700 ml-4">
                          {showEin && (
                            <li className="flex items-start">
                              <span className="font-semibold mr-2 min-w-[20px]">1.</span>
                              <div>
                                <span className="font-semibold">EIN (Employer Identification Number)</span>
                                <span className="text-gray-500 ml-2">⏱️ Tiempo aproximado: 1 mes</span>
                              </div>
                            </li>
                          )}
                          {showArticlesInc && (
                            <li className="flex items-start">
                              <span className="font-semibold mr-2 min-w-[20px]">{showEin ? '2.' : '1.'}</span>
                              <div>
                                <span className="font-semibold">Articles of Incorporation</span>
                                <span className="text-gray-500 ml-2">⏱️ Tiempo aproximado: 5-7 días hábiles</span>
                              </div>
                            </li>
                          )}
                          {showArticlesLlc && (
                            <li className="flex items-start">
                              <span className="font-semibold mr-2 min-w-[20px]">{showEin ? '2.' : '1.'}</span>
                              <div>
                                <span className="font-semibold">Articles of Organization</span>
                                <span className="text-gray-500 ml-2">⏱️ Tiempo aproximado: 5-7 días hábiles</span>
                              </div>
                            </li>
                          )}
                        </ol>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Signed Documents */}
              <Link href="/client/documents?tab=firmado" className="card hover:shadow-lg transition-shadow cursor-pointer block w-full h-full">
                <div className="flex items-start w-full">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className="h-8 w-8 text-green-500" />
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Documentos Firmados
                    </h3>
                    <p className="text-2xl font-bold text-green-600 mb-1">
                      {documents.filter(doc => categorizeDocument(doc) === 'firmado').length}
                    </p>
                    <p className="text-sm text-gray-600">
                      {documents.filter(doc => categorizeDocument(doc) === 'firmado').length === 0
                        ? 'Aún no hay documentos firmados'
                        : 'Documentos completados y firmados'}
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Business Phone Card - Only show if user explicitly requested US phone from Avenida Legal */}
            {needsUsPhoneFromAvenida && (
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
            <div>
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900">Documentos Recientes</h3>
                <p className="text-sm text-gray-600 mt-1">Gestiona tus documentos más recientes</p>
              </div>
              {loadingDocuments ? (
                <div className="card text-center py-12">
                  <ClockIcon className="h-12 w-12 mx-auto mb-4 animate-spin text-brand-500" />
                  <p className="text-gray-600">Cargando documentos...</p>
                </div>
              ) : documents.length === 0 ? (
                <div className="card text-center py-12">
                  <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-600">No hay documentos disponibles aún.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {documents.slice(0, 6).map((doc) => {
                    const isDownloaded = downloadedDocs.has(doc.id);
                    const isSigned = doc.signedS3Key || doc.status === 'signed';
                    const category = categorizeDocument(doc);

                    return (
                      <div key={doc.id} className="card hover:shadow-lg transition-shadow">
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center">
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900">{getDocumentTypeDisplayName(doc.name)}</h3>
                              </div>
                            </div>
                          </div>

                          {/* Checklist for individual document */}
                          {(category === 'por-firmar' || category === 'firmado') && (
                            <div className="mb-4 space-y-2">
                              <div className="flex items-center space-x-2 text-sm">
                                {isDownloaded || category === 'firmado' ? (
                                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                                ) : (
                                  <div className="h-4 w-4 border-2 border-gray-300 rounded" />
                                )}
                                <span className={isDownloaded || category === 'firmado' ? 'text-gray-600 line-through' : 'text-gray-900'}>
                                  1. Descargar
                                </span>
                              </div>
                              <div className="flex items-center space-x-2 text-sm">
                                {category === 'firmado' ? (
                                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                                ) : (
                                  <div className="h-4 w-4 border-2 border-gray-300 rounded" />
                                )}
                                <span className={category === 'firmado' ? 'text-gray-600 line-through' : 'text-gray-900'}>
                                  2. Imprimir y firmar
                                </span>
                              </div>
                              <div className="flex items-center space-x-2 text-sm">
                                {isSigned ? (
                                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                                ) : (
                                  <div className="h-4 w-4 border-2 border-gray-300 rounded" />
                                )}
                                <span className={isSigned ? 'text-gray-600 line-through' : 'text-gray-900'}>
                                  3. Subir
                                </span>
                              </div>
                            </div>
                          )}

                          {category === 'en-proceso' && (
                            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                              <p className="text-sm text-blue-800">
                                Este documento está siendo procesado. No se requiere ninguna acción de tu parte.
                              </p>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                            <span className="text-sm text-gray-500">
                              {new Date(doc.createdAt || doc.date).toLocaleDateString('es-ES', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                              })}
                            </span>
                          </div>

                          {category !== 'en-proceso' && (
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => handleDownload(doc.id)}
                                className="btn btn-primary flex-1 flex items-center justify-center"
                                title="Descargar"
                              >
                                <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                                Descargar
                              </button>
                              <label className="btn bg-green-600 hover:bg-green-700 text-white border-transparent flex-1 flex items-center justify-center cursor-pointer">
                                <input
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  onChange={(e) => handleFileSelect(doc.id, e)}
                                  className="hidden"
                                  disabled={uploading[doc.id]}
                                />
                                {uploading[doc.id] ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1"></div>
                                    Subiendo...
                                  </>
                                ) : (
                                  <>
                                    <ArrowUpTrayIcon className="h-4 w-4 mr-1" />
                                    Subir
                                  </>
                                )}
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}
