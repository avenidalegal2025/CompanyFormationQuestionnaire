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
  FunnelIcon
} from '@heroicons/react/24/outline';

export default function DocumentsPage() {
  const [currentTab, setCurrentTab] = useState('documents');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyData, setCompanyData] = useState<any>(null);

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
      description: 'Documento legal que establece tu empresa como entidad legal',
      status: 'completed',
      date: '2024-01-15',
      type: 'Legal',
      size: '2.3 MB',
      pages: 12
    },
    {
      id: 'ein-certificate',
      name: 'Certificado EIN',
      description: 'Número de identificación fiscal federal de tu empresa',
      status: 'processing',
      date: '2024-01-16',
      type: 'Fiscal',
      size: '156 KB',
      pages: 1
    },
    {
      id: 'operating-agreement',
      name: 'Acuerdo Operativo',
      description: 'Gobierno interno y estructura de tu empresa',
      status: 'pending',
      date: '2024-01-20',
      type: 'Legal',
      size: '1.8 MB',
      pages: 8
    },
    {
      id: 'business-license',
      name: 'Licencia Comercial',
      description: 'Permiso para operar en el estado de formación',
      status: 'pending',
      date: '2024-01-22',
      type: 'Comercial',
      size: '890 KB',
      pages: 3
    },
    {
      id: 'bank-resolution',
      name: 'Resolución Bancaria',
      description: 'Autorización para abrir cuentas bancarias empresariales',
      status: 'completed',
      date: '2024-01-18',
      type: 'Bancario',
      size: '445 KB',
      pages: 2
    },
    {
      id: 'minutes-meeting',
      name: 'Acta de Reunión Inicial',
      description: 'Registro de la primera reunión de directores',
      status: 'completed',
      date: '2024-01-17',
      type: 'Legal',
      size: '1.2 MB',
      pages: 5
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

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: documents.length,
    completed: documents.filter(doc => doc.status === 'completed').length,
    processing: documents.filter(doc => doc.status === 'processing').length,
    pending: documents.filter(doc => doc.status === 'pending').length
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

                    <p className="text-gray-600 text-sm mb-4">{doc.description}</p>

                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <span>{doc.pages} páginas</span>
                      <span>{doc.size}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">{doc.date}</span>
                      <div className="flex space-x-2">
                        <button className="p-2 text-gray-400 hover:text-gray-600" title="Ver">
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {doc.status === 'completed' && (
                          <button className="p-2 text-gray-400 hover:text-gray-600" title="Descargar">
                            <ArrowDownTrayIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty State */}
            {filteredDocuments.length === 0 && (
              <div className="text-center py-12">
                <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron documentos</h3>
                <p className="text-gray-600">Intenta ajustar los filtros de búsqueda</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
