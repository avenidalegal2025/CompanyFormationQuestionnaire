"use client";

import { useState, useEffect } from 'react';
import ClientNavigation from '@/components/ClientNavigation';
import Link from 'next/link';
import {
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ShoppingBagIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

export default function ClientPage() {
  const [currentTab, setCurrentTab] = useState('dashboard');
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
