"use client";

import { useState, useEffect } from 'react';
import ClientNavigation from '@/components/ClientNavigation';
import Link from 'next/link';
import {
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  PencilIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState('profile');
  const [companyData, setCompanyData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleNewCompany = () => {
    // Clear all localStorage data to start fresh
    localStorage.removeItem('questionnaireData');
    localStorage.removeItem('selectedCompanyId');
    // Redirect to questionnaire
    router.push('/');
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

  const getProfileData = () => {
    if (!companyData) return null;
    
    return {
      company: companyData.company || {},
      profile: companyData.profile || {},
      address: companyData.address || {},
      phone: companyData.phone || {}
    };
  };

  const profileData = getProfileData();

  if (!profileData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-700">Cargando perfil...</p>
        </div>
      </div>
    );
  }

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
                  <h1 className="text-2xl font-bold text-gray-900">Perfil</h1>
                  <p className="text-sm text-gray-600">{getCompanyDisplayName()}</p>
                </div>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <PencilIcon className="h-4 w-4 mr-2" />
                    {isEditing ? 'Cancelar' : 'Editar'}
                  </button>
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
          <main className="px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-4xl mx-auto">
              {/* Profile Header */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
                <div className="flex items-center">
                  <div className="h-20 w-20 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserIcon className="h-10 w-10 text-blue-600" />
                  </div>
                  <div className="ml-6">
                    <h2 className="text-2xl font-bold text-gray-900">{getCompanyDisplayName()}</h2>
                    <p className="text-gray-600">Empresa formada exitosamente</p>
                    <div className="flex items-center mt-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                      <span className="text-sm text-gray-600">Activa</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Company Information */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Información de la Empresa</h3>
                  <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Empresa</label>
                    <p className="text-gray-900">{profileData.company.companyName || 'No especificado'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Entidad</label>
                    <p className="text-gray-900">{profileData.company.entityType || 'No especificado'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado de Formación</label>
                    <p className="text-gray-900">{profileData.company.formationState || 'No especificado'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Formación</label>
                    <p className="text-gray-900">{new Date().toLocaleDateString('es-ES')}</p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Información de Contacto</h3>
                  <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <p className="text-gray-900">{profileData.profile.email || 'No especificado'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <p className="text-gray-900">{profileData.phone.phoneNumber || 'No especificado'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                    <p className="text-gray-900">{profileData.profile.fullName || 'No especificado'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                    <p className="text-gray-900">{profileData.profile.position || 'CEO/Founder'}</p>
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Dirección</h3>
                  <MapPinIcon className="h-5 w-5 text-gray-400" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección Principal</label>
                    <p className="text-gray-900">
                      {profileData.address.streetAddress || 'No especificado'}<br />
                      {profileData.address.city || ''}, {profileData.address.state || ''} {profileData.address.zipCode || ''}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
                    <p className="text-gray-900">{profileData.address.country || 'Estados Unidos'}</p>
                  </div>
                </div>
              </div>

              {/* Account Status */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Estado de la Cuenta</h3>
                  <CalendarIcon className="h-5 w-5 text-gray-400" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-green-600 font-bold">✓</span>
                    </div>
                    <h4 className="font-medium text-gray-900">Pago Completado</h4>
                    <p className="text-sm text-gray-600">Procesado exitosamente</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-blue-600 font-bold">⏳</span>
                    </div>
                    <h4 className="font-medium text-gray-900">Documentos</h4>
                    <p className="text-sm text-gray-600">En proceso de preparación</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-purple-600 font-bold">📧</span>
                    </div>
                    <h4 className="font-medium text-gray-900">Notificaciones</h4>
                    <p className="text-sm text-gray-600">Activas</p>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}







