"use client";

import { useState, useEffect } from 'react';
import ClientNavigation from '@/components/ClientNavigation';
import Link from 'next/link';
import {
  DocumentTextIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/outline';

export default function DocumentsPage() {
  const [currentTab, setCurrentTab] = useState('documents');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyData, setCompanyData] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});

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

    // Fetch documents from API
    fetchDocuments();
  }, []);

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
    const name = companyName || 'Mi Empresa';
    const type = entityType || '';
    const state = formationState || '';
    
    return `${name} ${type} ${state}`.trim();
  };

  const handleDownload = async (documentId: string) => {
    try {
      // Use the new secure authenticated endpoint
      // This will stream the document through our server with auth checks
      const viewUrl = `/api/documents/view?id=${encodeURIComponent(documentId)}`;
      window.open(viewUrl, '_blank');
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'signed':
      case 'generated':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'pending_signature':
        return <ClockIcon className="h-5 w-5 text-blue-500" />;
      case 'template':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'signed':
        return 'Firmado';
      case 'generated':
        return 'Generado';
      case 'pending_signature':
        return 'Pendiente de Firma';
      case 'template':
        return 'Plantilla';
      default:
        return 'Desconocido';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'signed':
      case 'generated':
        return 'text-green-600 bg-green-100';
      case 'pending_signature':
        return 'text-blue-600 bg-blue-100';
      case 'template':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (doc.description && doc.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Map document statuses to filter categories
    if (statusFilter === 'all') {
      return matchesSearch;
    }
    
    // Map statuses to filter categories
    const isCompleted = doc.status === 'signed' || doc.status === 'completed';
    const isProcessing = doc.status === 'generated' || doc.status === 'processing';
    const isPending = doc.status === 'pending' || doc.status === 'pending_signature' || doc.status === 'template';
    
    if (statusFilter === 'completed' && isCompleted) return matchesSearch;
    if (statusFilter === 'processing' && isProcessing) return matchesSearch;
    if (statusFilter === 'pending' && isPending) return matchesSearch;
    
    return false;
  });

  const statusCounts = {
    all: documents.length,
    completed: documents.filter(doc => doc.status === 'signed' || doc.status === 'completed').length,
    processing: documents.filter(doc => doc.status === 'generated' || doc.status === 'processing').length,
    pending: documents.filter(doc => doc.status === 'pending' || doc.status === 'pending_signature' || doc.status === 'template').length
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
                  <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
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
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <div className="text-blue-600 text-2xl mr-3">📄</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Total Documentos</h3>
                    <p className="text-2xl font-bold text-blue-600">{statusCounts.all}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <div className="text-green-600 text-2xl mr-3">✅</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Completados</h3>
                    <p className="text-2xl font-bold text-green-600">{statusCounts.completed}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <div className="text-blue-600 text-2xl mr-3">⏳</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">En Proceso</h3>
                    <p className="text-2xl font-bold text-blue-600">{statusCounts.processing}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <div className="text-yellow-600 text-2xl mr-3">⏰</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Pendientes</h3>
                    <p className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Search */}
                <div className="flex-1">
                  <div className="relative">
                    <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar documentos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Status Filter */}
                <div className="flex items-center space-x-2">
                  <FunnelIcon className="h-5 w-5 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="completed">Completados</option>
                    <option value="processing">En Proceso</option>
                    <option value="pending">Pendientes</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Documents Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocuments.map((doc) => (
                <div key={doc.id} className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        {getStatusIcon(doc.status)}
                        <div className="ml-3">
                          <h3 className="text-lg font-semibold text-gray-900">{doc.name}</h3>
                          <p className="text-sm text-gray-500">{doc.type}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                        {getStatusText(doc.status)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <span className="text-sm text-gray-500">
                        {new Date(doc.createdAt).toLocaleDateString('es-ES', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </span>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleDownload(doc.id)}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          title="Descargar"
                        >
                          <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                          Descargar
                        </button>
                        {/* Show upload button for tax forms that are generated but not signed */}
                        {doc.type === 'tax' && doc.status === 'generated' && (
                          <label className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 cursor-pointer">
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
                                Subir Documento Firmado
                              </>
                            )}
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Cargando documentos...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredDocuments.length === 0 && (
              <div className="text-center py-12">
                <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron documentos</h3>
                <p className="text-gray-600">
                  {documents.length === 0 
                    ? 'Aún no tienes documentos. Se generarán automáticamente después de tu pago.'
                    : 'Intenta ajustar los filtros de búsqueda'
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
