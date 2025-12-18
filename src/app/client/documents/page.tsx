"use client";

import { useState, useEffect, Suspense } from 'react';
import ClientNavigation from '@/components/ClientNavigation';
import Link from 'next/link';
import {
  DocumentTextIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ArrowUpTrayIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { useRouter, useSearchParams } from 'next/navigation';

function DocumentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentTab, setCurrentTab] = useState('documents');
  const [activeTab, setActiveTab] = useState<'firmado' | 'por-firmar' | 'en-proceso'>('por-firmar');
  const [searchTerm, setSearchTerm] = useState('');
  const [companyData, setCompanyData] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [downloadedDocs, setDownloadedDocs] = useState<Set<string>>(new Set());

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

    // Check for tab query parameter
    const tabParam = searchParams.get('tab');
    if (tabParam === 'por-firmar' || tabParam === 'firmado' || tabParam === 'en-proceso') {
      setActiveTab(tabParam);
    }

    // Fetch documents from API
    fetchDocuments();
  }, [searchParams]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

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

  const handleDownload = async (documentId: string) => {
    try {
      // Use the new secure authenticated endpoint
      // This will stream the document through our server with auth checks
      const viewUrl = `/api/documents/view?id=${encodeURIComponent(documentId)}`;
      window.open(viewUrl, '_blank');
      
      // Mark document as downloaded to show upload button
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

      const response = await fetch('/api/documents/upload-signed', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload signed document');
      }

      const result = await response.json();
      
      // Update local documents state
      setDocuments(prev => prev.map(doc => 
        doc.id === documentId 
          ? { ...doc, ...result.document }
          : doc
      ));

      alert('Documento firmado subido exitosamente. Se actualizará en Airtable automáticamente.');
      
      // Refresh documents to get latest from server
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
      // Validate file type (PDF only for tax forms)
      if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        alert('Por favor, sube un archivo PDF.');
        return;
      }
      handleUploadSigned(documentId, file);
    }
    // Reset input so same file can be selected again
    event.target.value = '';
  };


  // Categorize documents into three states
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
    
    // Default to 'por-firmar' for unknown statuses
    return 'por-firmar';
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (doc.description && doc.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const category = categorizeDocument(doc);
    return category === activeTab && matchesSearch;
  });

  // Calculate additional cards for "En Proceso" tab
  const getEnProcesoCardCount = () => {
    let count = 1; // EIN card is always there
    if (isCorporation()) count += 1; // Articles of Incorporation
    if (isLLC()) count += 1; // Articles of Organization
    return count;
  };

  const tabCounts = {
    'firmado': documents.filter(doc => categorizeDocument(doc) === 'firmado').length,
    'por-firmar': documents.filter(doc => categorizeDocument(doc) === 'por-firmar').length,
    'en-proceso': documents.filter(doc => categorizeDocument(doc) === 'en-proceso').length + getEnProcesoCardCount(),
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
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-20">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Documentos</h1>
                  <p className="text-sm text-gray-600 mt-1">{getCompanyDisplayName()}</p>
                </div>
                <div className="flex items-center space-x-4">
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
            {/* Tab Bar */}
            <div className="card p-0">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px" aria-label="Tabs">
                  <button
                    onClick={() => setActiveTab('por-firmar')}
                    className={`flex-1 px-6 py-4 text-sm font-medium text-center border-b-2 transition-colors ${
                      activeTab === 'por-firmar'
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Por Firmar
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'por-firmar'
                        ? 'bg-brand-100 text-brand-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tabCounts['por-firmar']}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('firmado')}
                    className={`flex-1 px-6 py-4 text-sm font-medium text-center border-b-2 transition-colors ${
                      activeTab === 'firmado'
                        ? 'border-green-600 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Completado
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'firmado'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tabCounts['firmado']}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('en-proceso')}
                    className={`flex-1 px-6 py-4 text-sm font-medium text-center border-b-2 transition-colors ${
                      activeTab === 'en-proceso'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    En Proceso
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'en-proceso'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tabCounts['en-proceso']}
                    </span>
                  </button>
                </nav>
              </div>
            </div>

                {/* Search */}
            <div className="card">
                  <div className="relative">
                    <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar documentos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10"
                    />
                  </div>
                </div>

            {/* Checklist Info for Por Firmar */}
            {activeTab === 'por-firmar' && (
              <div className="card bg-blue-50 border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  📋 Pasos a completar para cada documento:
                </h3>
                <div className="space-y-2">
                  {[
                    { key: 'download', label: 'Descargar' },
                    { key: 'sign', label: 'Imprimir y firmar' },
                    { key: 'upload', label: 'Subir' },
                  ].map((step, index) => (
                    <div key={step.key} className="flex items-center space-x-3">
                      <div className="h-5 w-5 border-2 border-gray-300 rounded flex-shrink-0" />
                      <span className="text-sm text-gray-900 font-medium">
                        {index + 1}. {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signed Documents List for Firmado */}
            {activeTab === 'firmado' && (
              <div className="card bg-green-50 border-green-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  ✅ Documentos firmados:
                </h3>
                <div className="space-y-2">
                  {documents
                    .filter(doc => categorizeDocument(doc) === 'firmado')
                    .map((doc, index) => (
                      <div key={doc.id} className="flex items-center space-x-3">
                        <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <span className="text-sm text-gray-900 font-medium">
                          {doc.name || 'Documento sin nombre'}
                        </span>
                      </div>
                    ))}
                  {documents.filter(doc => categorizeDocument(doc) === 'firmado').length === 0 && (
                    <p className="text-sm text-gray-600 italic">Aún no hay documentos firmados</p>
                  )}
              </div>
            </div>
            )}

            {/* Documents Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocuments.map((doc) => {
                const isDownloaded = downloadedDocs.has(doc.id);
                const isSigned = doc.signedS3Key || doc.status === 'signed';
                const category = categorizeDocument(doc);

                return (
                  <div key={doc.id} className="card hover:shadow-lg transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                          <div>
                          <h3 className="text-lg font-semibold text-gray-900">{doc.name}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">{doc.type}</p>
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
                          {new Date(doc.createdAt).toLocaleDateString('es-ES', { 
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

            {/* Loading State */}
            {loading && (
              <div className="card text-center py-12">
                <ClockIcon className="h-12 w-12 mx-auto mb-4 animate-spin text-brand-500" />
                <p className="text-gray-600">Cargando documentos...</p>
              </div>
            )}

            {/* En Proceso Cards */}
            {activeTab === 'en-proceso' && (
              <div className="space-y-6">
                {/* Helpers to know if lawyer has already uploaded these docs */}
                {(() => {
                  const hasDoc = (id: string) =>
                    documents.some(d => (d.id || '').toLowerCase() === id && (d.s3Key || d.signedS3Key));
                  const hasEin = hasDoc('ein-letter');
                  const hasArticlesInc = hasDoc('articles-inc');
                  const hasArticlesLlc = hasDoc('articles-llc');

                  return (
                    <>
                      {/* EIN Card */}
                      {!hasEin && (
                        <div className="card border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
                          <div className="p-6">
                            <div className="flex items-start">
                              <div className="flex-shrink-0">
                                <ClockIcon className="h-8 w-8 text-blue-500" />
                              </div>
                              <div className="ml-4 flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="text-lg font-semibold text-gray-900">
                                    EIN (Employer Identification Number)
                                  </h3>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                    En Proceso
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">
                                  Requisito expedido por el IRS necesario para abrir una cuenta de banco.
                                </p>
                                <p className="text-sm text-gray-500 font-medium">
                                  ⏱️ Tiempo aproximado: 1 mes
                                </p>
                                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                                  <p className="text-sm text-blue-800">
                                    Este trámite está siendo procesado. No se requiere ninguna acción de tu parte.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Articles of Incorporation Card (for Corporations) */}
                      {isCorporation() && !hasArticlesInc && (
                        <div className="card border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
                          <div className="p-6">
                            <div className="flex items-start">
                              <div className="flex-shrink-0">
                                <ClockIcon className="h-8 w-8 text-blue-500" />
                              </div>
                              <div className="ml-4 flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="text-lg font-semibold text-gray-900">
                                    Articles of Incorporation
                                  </h3>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                    En Proceso
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">
                                  Documento legal que establece la existencia de tu corporación ante el estado.
                                </p>
                                <p className="text-sm text-gray-500 font-medium">
                                  ⏱️ Tiempo aproximado: 5-7 días hábiles
                                </p>
                                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                                  <p className="text-sm text-blue-800">
                                    Este documento está siendo procesado por el estado. No se requiere ninguna acción de tu parte.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Articles of Organization Card (for LLCs) */}
                      {isLLC() && !hasArticlesLlc && (
                        <div className="card border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
                          <div className="p-6">
                            <div className="flex items-start">
                              <div className="flex-shrink-0">
                                <ClockIcon className="h-8 w-8 text-blue-500" />
                              </div>
                              <div className="ml-4 flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="text-lg font-semibold text-gray-900">
                                    Articles of Organization
                                  </h3>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                    En Proceso
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">
                                  Documento legal que establece la existencia de tu LLC ante el estado.
                                </p>
                                <p className="text-sm text-gray-500 font-medium">
                                  ⏱️ Tiempo aproximado: 5-7 días hábiles
                                </p>
                                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                                  <p className="text-sm text-blue-800">
                                    Este documento está siendo procesado por el estado. No se requiere ninguna acción de tu parte.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
                  <div className="p-6">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <ClockIcon className="h-8 w-8 text-blue-500" />
                      </div>
                      <div className="ml-4 flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            EIN (Employer Identification Number)
                          </h3>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                            En Proceso
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          Requisito expedido por el IRS necesario para abrir una cuenta de banco.
                        </p>
                        <p className="text-sm text-gray-500 font-medium">
                          ⏱️ Tiempo aproximado: 1 mes
                        </p>
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm text-blue-800">
                            Este trámite está siendo procesado. No se requiere ninguna acción de tu parte.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Articles of Incorporation Card (for Corporations) */}
                {isCorporation() && (
                  <div className="card border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <ClockIcon className="h-8 w-8 text-blue-500" />
                        </div>
                        <div className="ml-4 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              Articles of Incorporation
                            </h3>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                              En Proceso
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            Documento legal que establece la existencia de tu corporación ante el estado.
                          </p>
                          <p className="text-sm text-gray-500 font-medium">
                            ⏱️ Tiempo aproximado: 5-7 días hábiles
                          </p>
                          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800">
                              Este documento está siendo procesado por el estado. No se requiere ninguna acción de tu parte.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Articles of Organization Card (for LLCs) */}
                {isLLC() && (
                  <div className="card border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <ClockIcon className="h-8 w-8 text-blue-500" />
                        </div>
                        <div className="ml-4 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              Articles of Organization
                            </h3>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                              En Proceso
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            Documento legal que establece la existencia de tu LLC ante el estado.
                          </p>
                          <p className="text-sm text-gray-500 font-medium">
                            ⏱️ Tiempo aproximado: 5-7 días hábiles
                          </p>
                          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800">
                              Este documento está siendo procesado por el estado. No se requiere ninguna acción de tu parte.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredDocuments.length === 0 && activeTab !== 'en-proceso' && (
              <div className="card text-center py-12">
                <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {activeTab === 'por-firmar' 
                    ? 'No hay documentos por firmar'
                    : activeTab === 'firmado'
                    ? 'No hay documentos firmados'
                    : 'No hay documentos en proceso'
                  }
                </h3>
                <p className="text-gray-600 text-sm">
                  {documents.length === 0 
                    ? 'Aún no tienes documentos. Se generarán automáticamente después de tu pago.'
                    : 'Intenta ajustar la búsqueda o cambiar de pestaña'
                  }
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ClockIcon className="h-12 w-12 mx-auto mb-4 animate-spin text-brand-500" />
          <p className="text-gray-600">Cargando documentos...</p>
        </div>
      </div>
    }>
      <DocumentsContent />
    </Suspense>
  );
}
