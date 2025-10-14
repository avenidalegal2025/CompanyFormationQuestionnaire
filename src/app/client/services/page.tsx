"use client";

import { useState, useEffect } from 'react';
import { 
  PlusIcon, 
  ArrowRightIcon,
  StarIcon,
  CheckIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ArrowRightOnRectangleIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import ClientNavigation from '@/components/ClientNavigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ServiceCard {
  id: string;
  title: string;
  description: string;
  price: string;
  originalPrice?: string;
  icon: string;
  category: 'estate' | 'legal' | 'digital';
  featured?: boolean;
  popular?: boolean;
  isNew?: boolean;
  features: string[];
  estimatedTime: string;
  rating?: number;
}

const serviceCards: ServiceCard[] = [
  {
    id: 'supreme-legacy',
    title: 'Supreme Legacy',
    description: 'Planificación patrimonial completa: Testamento, Testamento Vital, Directiva de Atención Médica y Fideicomiso',
    price: '$2,800',
    icon: '🏛️',
    category: 'estate',
    featured: true,
    popular: true,
    features: [
      'Testamento completo y personalizado',
      'Testamento vital (Living Will)',
      'Directiva de atención médica',
      'Fideicomiso revocable',
      'Asesoría legal especializada',
      'Documentos notarizados'
    ],
    estimatedTime: '2-3 días hábiles',
    rating: 4.9
  },
  {
    id: 'trademark-registration',
    title: 'Registro de Marca',
    description: 'Registro de marca comercial para proteger tu identidad de marca',
    price: 'desde $825',
    icon: '™️',
    category: 'legal',
    popular: true,
    features: [
      'Búsqueda de disponibilidad',
      'Solicitud de registro federal',
      'Seguimiento del proceso',
      'Certificado de registro',
      'Protección por 10 años',
      'Asesoría legal especializada'
    ],
    estimatedTime: '4-6 meses',
    rating: 4.7
  },
  {
    id: 'copyright-per-work',
    title: 'Copyright (por obra)',
    description: 'Registro de derechos de autor para proteger tu obra creativa',
    price: 'desde $480 por obra',
    icon: '©️',
    category: 'legal',
    popular: true,
    features: [
      'Registro federal de copyright',
      'Protección por 70 años',
      'Certificado oficial',
      'Búsqueda de registros existentes',
      'Asesoría legal especializada'
    ],
    estimatedTime: '2-4 meses',
    rating: 4.8
  },
  {
    id: 'domain-registration',
    title: 'Registro de Dominio .com',
    description: 'Asegura tu dominio perfecto para tu negocio con registro y configuración',
    price: 'desde $20 al año',
    icon: '🌐',
    category: 'digital',
    features: [
      'Registro de dominio .com',
      'Configuración DNS',
      'Protección de privacidad',
      'Renovación automática',
      'Soporte técnico 24/7'
    ],
    estimatedTime: 'Inmediato',
    rating: 4.7
  },
  {
    id: 'google-workspace',
    title: 'Google Mail + Drive + Workspace',
    description: 'Suite completa de productividad empresarial con Google',
    price: 'desde $10 al mes',
    icon: '📧',
    category: 'digital',
    features: [
      'Gmail empresarial personalizado',
      'Google Drive ilimitado',
      'Google Meet para videoconferencias',
      'Google Docs, Sheets, Slides',
      'Soporte 24/7'
    ],
    estimatedTime: 'Inmediato',
    rating: 4.8
  },
  {
    id: 'quickbooks',
    title: 'QuickBooks',
    description: 'Sistema contable profesional para tu empresa',
    price: '$25 al mes',
    icon: '📊',
    category: 'digital',
    features: [
      'Facturación y cobros',
      'Seguimiento de gastos',
      'Reportes financieros',
      'Integración bancaria',
      'Soporte contable'
    ],
    estimatedTime: '1-2 días hábiles',
    rating: 4.7
  },
  {
    id: 'domain-registration',
    title: 'Registro de Dominio .com',
    description: 'Asegura tu dominio perfecto para tu negocio con registro y configuración',
    price: 'desde $12.99 al año',
    icon: '🌐',
    category: 'digital',
    features: [
      'Registro de dominio .com',
      'Configuración DNS',
      'Protección de privacidad',
      'Renovación automática',
      'Soporte técnico 24/7',
      'Gestión desde tu hub empresarial'
    ],
    estimatedTime: 'Inmediato',
    rating: 4.8,
    isNew: true
  }
];

const categories = [
  { id: 'all', name: 'Todos', icon: '🔍' },
  { id: 'estate', name: 'Patrimonial', icon: '🏛️' },
  { id: 'legal', name: 'Propiedad Intelectual', icon: '⚖️' },
  { id: 'digital', name: 'Digital', icon: '💻' }
];

export default function ServicesPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState<string[]>([]);
  const [companyData, setCompanyData] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    // Get company data from localStorage or API
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

  const handleLogout = () => {
    // Clear all authentication data
    localStorage.removeItem('hasCompletedPayment');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('questionnaireData');
    
    // Redirect to home page
    router.push('/');
  };

  const getCompanyDisplayName = () => {
    if (!companyData?.company) return 'Mi Empresa';
    
    const { companyName, entityType, formationState } = companyData.company;
    const name = companyName || 'Mi Empresa';
    const type = entityType || '';
    const state = formationState || '';
    
    return `${name} ${type} ${state}`.trim();
  };

  const filteredServices = selectedCategory === 'all'
    ? serviceCards
    : serviceCards.filter(service => service.category === selectedCategory);

  const addToCart = (serviceId: string) => {
    setCart(prev => [...prev, serviceId]);
  };

  const removeFromCart = (serviceId: string) => {
    setCart(prev => prev.filter(id => id !== serviceId));
  };

  const isInCart = (serviceId: string) => cart.includes(serviceId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <ClientNavigation currentTab="services" onTabChange={() => {}} />

        {/* Main Content */}
        <div className="flex-1 lg:ml-64">
          {/* Header */}
          <header className="bg-white shadow-sm border-b">
            <div className="px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Servicios Adicionales</h1>
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
          {/* Categories */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Categorías</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center px-4 py-2 rounded-lg border transition-colors ${
                    selectedCategory === category.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-2">{category.icon}</span>
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* Featured Service */}
          {selectedCategory === 'all' && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Servicio Destacado</h2>
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <StarIcon className="h-6 w-6 text-yellow-400 mr-2" />
                      <span className="text-yellow-200 font-medium">Más Popular</span>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold">$2,800</span>
                    </div>
                  </div>
                  <h3 className="text-3xl font-bold mb-4">Supreme Legacy</h3>
                  <p className="text-blue-100 text-lg mb-6">
                    Planificación patrimonial completa: Testamento, Testamento Vital, Directiva de Atención Médica y Fideicomiso
                  </p>
                  <div className="flex items-center space-x-6 mb-6">
                    <div className="flex items-center">
                      <ClockIcon className="h-5 w-5 text-blue-200 mr-2" />
                      <span>2-3 días hábiles</span>
                    </div>
                    <div className="flex items-center">
                      <StarIcon className="h-5 w-5 text-yellow-400 mr-1" />
                      <span>4.9 (127 reseñas)</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => addToCart('supreme-legacy')}
                    className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                  >
                    Agregar al Carrito
                  </button>
                </div>
                <div className="absolute top-0 right-0 text-8xl opacity-20">🏛️</div>
              </div>
            </div>
          )}

          {/* Services Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredServices.map((service) => (
              <div key={service.id} className="bg-white rounded-xl shadow hover:shadow-lg transition-shadow relative">
                {service.popular && (
                  <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-xs font-semibold">
                    Popular
                  </div>
                )}
                
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-4xl">{service.icon}</div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{service.price}</div>
                      {service.originalPrice && (
                        <div className="text-sm text-gray-500 line-through">{service.originalPrice}</div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{service.title}</h3>
                  <p className="text-gray-600 mb-4">{service.description}</p>

                  <div className="space-y-2 mb-6">
                    {service.features.slice(0, 3).map((feature, index) => (
                      <div key={index} className="flex items-center text-sm text-gray-600">
                        <CheckIcon className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                        {feature}
                      </div>
                    ))}
                    {service.features.length > 3 && (
                      <div className="text-sm text-gray-500">
                        +{service.features.length - 3} más...
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
                    <div className="flex items-center">
                      <ClockIcon className="h-4 w-4 mr-1" />
                      {service.estimatedTime}
                    </div>
                    {service.rating && (
                      <div className="flex items-center">
                        <StarIcon className="h-4 w-4 text-yellow-400 mr-1" />
                        {service.rating}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => isInCart(service.id) ? removeFromCart(service.id) : addToCart(service.id)}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center ${
                      isInCart(service.id)
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isInCart(service.id) ? 'Quitar del Carrito' : 'Agregar al Carrito'}
                    <ArrowRightIcon className="h-4 w-4 ml-2" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Empty State */}
          {filteredServices.length === 0 && (
            <div className="text-center py-12">
              <PlusIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay servicios en esta categoría</h3>
              <p className="text-gray-500">Prueba seleccionando otra categoría</p>
            </div>
          )}

          {/* CTA Section */}
          <div className="mt-16 bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-8 text-white text-center">
            <h2 className="text-3xl font-bold mb-4">¿Necesitas algo personalizado?</h2>
            <p className="text-gray-300 mb-6 text-lg">
              Nuestro equipo puede crear un paquete de servicios personalizado para tu negocio
            </p>
            <button className="bg-white text-gray-900 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              Contactar Asesor
            </button>
          </div>
          </main>
        </div>
      </div>
    </div>
  );
}
