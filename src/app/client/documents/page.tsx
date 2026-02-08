"use client";

import { useState, useEffect, useCallback, Suspense } from 'react';
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
import { getDocumentTypeDisplayName } from '@/lib/document-names';

function DocumentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentTab, setCurrentTab] = useState('documents');
  const [activeTab, setActiveTab] = useState<'firmado' | 'por-firmar' | 'en-proceso'>('por-firmar');
  const [companyData, setCompanyData] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [downloadedDocs, setDownloadedDocs] = useState<Set<string>>(new Set());
  const [directLinks, setDirectLinks] = useState<Record<string, string>>({});

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

  const fetchCompanyData = useCallback(async () => {
    try {
      const selectedCompanyId = localStorage.getItem('selectedCompanyId');
      if (!selectedCompanyId) {
        console.log('⚠️ No selectedCompanyId found');
        return;
      }
      
      console.log('🔍 Fetching company data for ID:', selectedCompanyId);
      const response = await fetch(`/api/companies?companyId=${encodeURIComponent(selectedCompanyId)}`);
      if (response.ok) {
        const data = await response.json();
        console.log('📦 API response:', data);
        if (data.company) {
          // Set company data in the format expected by the component
          const companyInfo = {
            company: {
              companyName: data.company.companyName,
              entityType: data.company.entityType, // From Airtable Entity Type column
              formationState: data.company.formationState,
            }
          };
          setCompanyData(companyInfo);
          console.log('✅ Fetched company data from Airtable:', data.company);
          console.log('📋 Entity Type:', data.company.entityType);
          console.log('🏢 Is Corporation?', data.company.entityType?.toLowerCase().includes('corp') || data.company.entityType?.toLowerCase().includes('inc'));
        } else {
          console.error('❌ No company data in response:', data);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Failed to fetch company data from Airtable:', response.status, errorData);
    }
    } catch (error) {
      console.error('❌ Error fetching company data:', error);
    }
  }, []);

  const fetchDocuments = useCallback(async (preserveLocalUpdates = false) => {
    try {
      setLoading(true);
      const selectedCompanyId = localStorage.getItem('selectedCompanyId') || undefined;
      const query = selectedCompanyId ? `?companyId=${encodeURIComponent(selectedCompanyId)}` : '';
      const response = await fetch(`/api/documents${query}`);
      if (response.ok) {
        const data = await response.json();
        const fetchedDocs = data.documents || [];
        console.log('📥 Fetched documents from API:', fetchedDocs.length, 'documents');
        fetchedDocs.forEach((d: any) => {
          const category = categorizeDocument(d);
          console.log(`  - ${d.name}: status=${d.status}, signedS3Key=${d.signedS3Key ? 'YES' : 'NO'}, category=${category}`);
        });
        
        if (preserveLocalUpdates) {
          // Merge: preserve local signed documents if server doesn't have them yet
          setDocuments(prev => {
            const merged = fetchedDocs.map((serverDoc: any) => {
              // Check if we have a local version with signed status
              const localDoc = prev.find(d => d.id === serverDoc.id);
              if (localDoc && (localDoc.signedS3Key || localDoc.status === 'signed')) {
                // If server has it signed too, use server (it's authoritative)
                if (serverDoc.signedS3Key || serverDoc.status === 'signed') {
                  return serverDoc;
                }
                // Server doesn't have signed version yet, keep local
                console.log(`⚠️ Keeping local signed version for ${serverDoc.name}`);
                return localDoc;
              }
              return serverDoc;
            });
            
            // Add any local documents that aren't in server response
            prev.forEach(localDoc => {
              if (!fetchedDocs.some((d: any) => d.id === localDoc.id)) {
                if (localDoc.signedS3Key || localDoc.status === 'signed') {
                  console.log(`⚠️ Adding local signed document not in server: ${localDoc.name}`);
                  merged.push(localDoc);
                }
              }
            });
            
            return merged;
          });
        } else {
          setDocuments(fetchedDocs);
        }
      } else {
        console.error('Failed to fetch documents');
      }
      // Also fetch company data from Airtable (uses same selectedCompanyId)
      await fetchCompanyData();
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchCompanyData]);

  useEffect(() => {
    // Check for tab query parameter
    const tabParam = searchParams.get('tab');
    if (tabParam === 'por-firmar' || tabParam === 'firmado' || tabParam === 'en-proceso') {
      setActiveTab(tabParam);
    }

    // Fetch company data from Airtable using selectedCompanyId
    fetchCompanyData();
    
    // Fetch documents from API - preserve local updates (signed documents)
    fetchDocuments(true);
  }, [searchParams, fetchCompanyData, fetchDocuments]);

  // Debug: Log when companyData changes
  useEffect(() => {
    console.log('📊 companyData changed:', companyData);
    if (companyData?.company) {
      console.log('📋 Entity Type from companyData:', companyData.company.entityType);
    }
  }, [companyData]);

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
    if (!companyData?.company) {
      return '';
    }
    // Get Entity Type directly from Airtable (Entity Type column)
    const entityType = companyData.company.entityType || '';
    return entityType.trim();
  };

  const isCorporation = () => {
    const entityType = getEntityType();
    if (!entityType) {
      console.log('🔍 isCorporation: No entity type found');
      return false;
    }
    const lower = entityType.toLowerCase();
    const result = lower === 'c-corp' || 
           lower === 's-corp' || 
           lower.includes('corp') || 
           lower.includes('inc') || 
           lower.includes('corporation');
    console.log('🔍 isCorporation:', { entityType, lower, result });
    return result;
  };

  const isLLC = () => {
    const entityType = getEntityType();
    if (!entityType) {
      console.log('🔍 isLLC: No entity type found');
      return false;
    }
    const lower = entityType.toLowerCase();
    const result = lower === 'llc' || 
           lower === 'l.l.c.' ||
           lower.includes('llc') || 
           lower.includes('limited liability');
    console.log('🔍 isLLC:', { entityType, lower, result });
    return result;
  };

  const handleDownload = async (documentId: string) => {
    try {
      // Use the new secure authenticated endpoint
      // This will stream the document through our server with auth checks
      const selectedCompanyId = localStorage.getItem('selectedCompanyId') || undefined;
      const companyQuery = selectedCompanyId ? `&companyId=${encodeURIComponent(selectedCompanyId)}` : '';
      const viewUrl = `/api/documents/view?id=${encodeURIComponent(documentId)}${companyQuery}`;
      window.open(viewUrl, '_blank');
      
      // Mark document as downloaded to show upload button
      setDownloadedDocs(prev => new Set(prev).add(documentId));
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('Error al descargar el documento. Por favor, intenta de nuevo.');
    }
  };

  const handleGetDirectLink = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/download`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'No se pudo generar el enlace');
      }
      const data = await response.json();
      if (data?.url) {
        setDirectLinks(prev => ({ ...prev, [documentId]: data.url }));
      }
    } catch (error: any) {
      alert(error.message || 'Error al generar el enlace');
    }
  };

  const handleUploadSigned = async (documentId: string, file: File) => {
    try {
      setUploading(prev => ({ ...prev, [documentId]: true }));

      const formData = new FormData();
      formData.append('documentId', documentId);
      formData.append('file', file);
      // Include companyId so the API knows which company's documents to update
      const selectedCompanyId = localStorage.getItem('selectedCompanyId');
      if (selectedCompanyId) {
        formData.append('companyId', selectedCompanyId);
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
      
      console.log('✅ Upload successful, result:', result);
      console.log('📋 Document after upload:', { 
        id: documentId, 
        signedS3Key: result.document.signedS3Key, 
        status: result.document.status 
      });
      
      // Update local documents state immediately with signed status
      setDocuments(prev => {
        const updated = prev.map(doc => {
          if (doc.id === documentId) {
            const updatedDoc = { 
              ...doc, 
              signedS3Key: result.document.signedS3Key, 
              status: 'signed' as const,
              signedAt: result.document.signedAt || new Date().toISOString()
            };
            console.log('🔄 Updated document in state:', updatedDoc);
            // Check category using inline logic (same as categorizeDocument)
            const hasSigned = updatedDoc.signedS3Key || updatedDoc.status === 'signed';
            console.log('📂 Document is signed?', hasSigned, 'signedS3Key:', updatedDoc.signedS3Key, 'status:', updatedDoc.status);
            return updatedDoc;
          }
          return doc;
        });
        return updated;
      });

      // Mark as downloaded and signed for UI updates
      setDownloadedDocs(prev => new Set(prev).add(documentId));

      // If user is on "por-firmar" tab, switch to "firmado" to show the completed document
      if (activeTab === 'por-firmar') {
        console.log('🔄 Switching to firmado tab to show completed document');
        setTimeout(() => setActiveTab('firmado'), 100); // Small delay to ensure state is updated
      }

      alert('Documento firmado subido exitosamente. Se actualizará en Airtable automáticamente.');
      
      // CRITICAL: Do NOT refresh documents from server immediately
      // The local state update is sufficient and correct
      // Any refresh will overwrite our local state with potentially stale server data
      // The document will be refreshed naturally when user navigates away and back, or on page reload
      console.log('✅ Upload complete - keeping local state update, no server refresh');
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
    const category = categorizeDocument(doc);
    return category === activeTab;
  });

  // Helper to know if lawyer has already uploaded EIN/Articles docs
  const hasDoc = (id: string) => {
    const found = documents.some(d => {
      const docId = (d.id || '').toLowerCase().trim();
      return docId === id.toLowerCase().trim() && (d.s3Key || d.signedS3Key);
    });
    return found;
  };
  const hasEin = hasDoc('ein-letter');
  const hasArticlesInc = hasDoc('articles-inc');
  const hasArticlesLlc = hasDoc('articles-llc');

  // Calculate additional cards for "En Proceso" tab
  const getEnProcesoCardCount = () => {
    let count = 0;
    if (!hasEin) count += 1; // EIN card
    if (isCorporation() && !hasArticlesInc) count += 1; // Articles of Incorporation
    if (isLLC() && !hasArticlesLlc) count += 1; // Articles of Organization
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

            {/* Checklist Info for Por Firmar */}
            {activeTab === 'por-firmar' && (
              <div className="card bg-blue-50 border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  📋 Pasos a completar para cada documento:
                </h3>
                <div className="space-y-2 mb-4">
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
                          {getDocumentTypeDisplayName(doc.name) || 'Documento sin nombre'}
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
                          <h3 className={`text-lg font-semibold ${category === 'firmado' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {getDocumentTypeDisplayName(doc.name)}
                          </h3>
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
                            {isSigned || category === 'firmado' ? (
                              <CheckCircleIcon className="h-4 w-4 text-green-600" />
                            ) : (
                              <div className="h-4 w-4 border-2 border-gray-300 rounded" />
                            )}
                            <span className={isSigned || category === 'firmado' ? 'text-gray-600 line-through' : 'text-gray-900'}>
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

                      {category === 'firmado' && ['ein-letter', 'articles-inc', 'articles-llc'].includes((doc.id || '').toLowerCase()) && (
                        <div className="mt-3 text-xs text-gray-600">
                          <button
                            type="button"
                            className="text-blue-600 hover:text-blue-800 underline"
                            onClick={() => handleGetDirectLink(doc.id)}
                          >
                            Obtener enlace directo de descarga
                          </button>
                          {directLinks[doc.id] && (
                            <div className="mt-2 break-all">
                              <a href={directLinks[doc.id]} className="text-blue-600 hover:text-blue-800">
                                {directLinks[doc.id]}
                              </a>
                            </div>
                          )}
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
                {(() => {
                  const corpCheck = isCorporation();
                  const hasArticles = hasArticlesInc;
                  console.log('🔍 Articles Inc Card Check:', { 
                    isCorporation: corpCheck, 
                    hasArticlesInc: hasArticles, 
                    shouldShow: corpCheck && !hasArticles,
                    companyData: companyData?.company
                  });
                  return corpCheck && !hasArticles;
                })() && (
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
                {(() => {
                  const llcCheck = isLLC();
                  const hasArticles = hasArticlesLlc;
                  console.log('🔍 Articles LLC Card Check:', { 
                    isLLC: llcCheck, 
                    hasArticlesLlc: hasArticles, 
                    shouldShow: llcCheck && !hasArticles,
                    companyData: companyData?.company
                  });
                  return llcCheck && !hasArticles;
                })() && (
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
