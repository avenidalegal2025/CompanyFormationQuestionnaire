"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import ClientNavigation from '@/components/ClientNavigation';
import DomainPurchase from '@/components/DomainPurchase';
import Link from 'next/link';
import {
  GlobeAltIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ShoppingCartIcon,
  PlusIcon,
  EyeIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';

interface DomainResult {
  domain: string;
  available: boolean;
  price?: number;
  currency?: string;
  registrationPeriod?: number;
  renewalPrice?: number;
}

interface SearchResponse {
  success: boolean;
  domain: string;
  primaryResult: any;
  suggestions: any[];
  results: any[];
  totalChecked: number;
  availableCount: number;
}

interface PurchasedDomain {
  id: string;
  domain: string;
  status: 'active' | 'pending' | 'expired';
  purchaseDate: string;
  expiryDate: string;
  price: number;
  autoRenew: boolean;
}

export default function DomainsPage() {
  const { data: session, status } = useSession();
  const [currentTab, setCurrentTab] = useState('domains');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [purchasedDomains, setPurchasedDomains] = useState<PurchasedDomain[]>([]);
  const [companyData, setCompanyData] = useState<any>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

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

    // Debug session data
    console.log('Session status:', status);
    console.log('Session data:', session);
    if (session) {
      console.log('User session data:', session);
      console.log('User email:', session.user?.email);
      console.log('User name:', session.user?.name);
    }

    // Load purchased domains (mock data for now)
    setPurchasedDomains([
      {
        id: '1',
        domain: 'mycompany.com',
        status: 'active',
        purchaseDate: '2024-01-15',
        expiryDate: '2025-01-15',
        price: 12.99,
        autoRenew: true
      }
    ]);

    // Handle Stripe checkout success/cancel
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    const sessionId = urlParams.get('session_id');

    if (success && sessionId) {
      // Payment was successful, show success message
      alert('Payment successful! Your domains are being registered. You will receive a confirmation email shortly.');
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (canceled) {
      // Payment was canceled
      alert('Payment was canceled. You can try again anytime.');
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
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

  const handleDomainSearch = async () => {
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch('/api/domains/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain: searchTerm }),
      });

      const data = await response.json();
      console.log('Search response:', data);
      
      if (data.success) {
        // Handle the new enhanced search response format
        setSearchResults([data]); // Wrap in array to maintain compatibility
        console.log('Search results set:', [data]);
      } else {
        console.error('Search failed:', data.error);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDomainCheck = async (domains: string[]) => {
    try {
      const response = await fetch('/api/domains/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domains }),
      });

      const data = await response.json();
      
      if (data.success) {
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error('Check error:', error);
    }
  };

  const handleDomainSelect = (domain: string) => {
    setSelectedDomains(prev => 
      prev.includes(domain) 
        ? prev.filter(d => d !== domain)
        : [...prev, domain]
    );
  };

  const handlePurchaseDomains = async () => {
    if (selectedDomains.length === 0) return;
    
    // Show modal - authentication will be checked in handleConfirmPurchase
    setShowPurchaseModal(true);
  };

  const handleConfirmPurchase = async (domains: string[]) => {
    try {
      // Debug authentication status
      console.log('Authentication status:', { status, session: !!session, user: session?.user });
      
      // Check if user is authenticated
      if (status === 'loading') {
        console.log('Authentication still loading...');
        alert('Please wait while we verify your authentication...');
        return;
      }

      if (status === 'unauthenticated' || !session) {
        console.log('User not authenticated:', { status, session });
        alert('Please sign in to purchase domains');
        return;
      }

      // Get customer information from Auth0 session and company data
      const customerEmail = session.user?.email || companyData?.profile?.email;
      const customerName = companyData?.company?.companyName || session.user?.name || 'Company';
      
      if (!customerEmail) {
        alert('Email is required for domain registration. Please ensure your Auth0 profile has an email address.');
        return;
      }

      console.log('Using customer data:', { customerEmail, customerName });

      // Create Stripe checkout session
      const response = await fetch('/api/domains/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domains: selectedDomains,
          customerEmail: customerEmail,
          customerName: customerName
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Checkout session created:', result);
        
        // Redirect to Stripe checkout
        window.location.href = result.url;
      } else {
        const error = await response.json();
        console.error('Checkout session creation failed:', error);
        alert(`Failed to create checkout session: ${error.error}`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to create checkout session. Please try again.');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'expired':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'expired':
        return 'text-red-600 bg-red-100';
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
                  <h1 className="text-2xl font-bold text-gray-900">Gestión de Dominios</h1>
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
            {/* Search Section */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Buscar Dominios</h2>
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Ingresa el nombre de tu dominio (ej: miempresa.com)"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleDomainSearch()}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <button
                  onClick={handleDomainSearch}
                  disabled={isSearching || !searchTerm.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSearching ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Buscando...
                    </>
                  ) : (
                    <>
                      <MagnifyingGlassIcon className="h-4 w-4 mr-2" />
                      Buscar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm mb-8">
                {/* Primary Result */}
                {searchResults[0]?.primaryResult && (
                  <div className="px-6 py-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex items-center">
                          {searchResults[0].primaryResult.available ? (
                            <CheckCircleIcon className="h-6 w-6 text-green-500 mr-3" />
                          ) : (
                            <XCircleIcon className="h-6 w-6 text-red-500 mr-3" />
                          )}
                          <div>
                            <h3 className="text-2xl font-bold text-gray-900">
                              {searchResults[0].primaryResult.domain}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {searchResults[0].primaryResult.available ? 'Disponible' : 'No disponible'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        {searchResults[0].primaryResult.available && (
                          <>
                            {searchResults[0].primaryResult.specialOffer && (
                              <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                                {searchResults[0].primaryResult.specialOffer}
                              </div>
                            )}
                            <div className="text-right">
                              <p className="text-2xl font-bold text-gray-900">
                                {searchResults[0].primaryResult.formattedPrice}
                              </p>
                              {searchResults[0].primaryResult.discount > 0 && (
                                <p className="text-sm text-gray-500 line-through">
                                  {searchResults[0].primaryResult.formattedRetailPrice}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDomainSelect(searchResults[0].primaryResult.domain)}
                              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 flex items-center"
                            >
                              <ShoppingCartIcon className="h-5 w-5 mr-2" />
                              Agregar al carrito
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggested Results */}
                {searchResults[0]?.suggestions && searchResults[0].suggestions.length > 0 && (
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Resultados Sugeridos</h3>
                      <button className="text-sm text-gray-500 hover:text-gray-700">Ocultar</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults[0].suggestions.map((result, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <GlobeAltIcon className="h-5 w-5 text-gray-400 mr-2" />
                              <h4 className="text-lg font-medium text-gray-900">{result.domain}</h4>
                            </div>
                            <div className="flex items-center">
                              {result.available ? (
                                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                              ) : (
                                <XCircleIcon className="h-5 w-5 text-red-500" />
                              )}
                            </div>
                          </div>
                          
                          {result.available && (
                            <div className="space-y-2">
                              {result.discountText && (
                                <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium inline-block">
                                  {result.discountText}
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-lg font-semibold text-gray-900">
                                    {result.formattedPrice}
                                  </p>
                                  {result.discount > 0 && (
                                    <p className="text-sm text-gray-500 line-through">
                                      {result.formattedRetailPrice}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleDomainSelect(result.domain)}
                                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center"
                                >
                                  <ShoppingCartIcon className="h-4 w-4 mr-1" />
                                  Agregar
                                </button>
                              </div>
                            </div>
                          )}
                          
                          {!result.available && (
                            <p className="text-sm text-gray-500">No disponible</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedDomains.length > 0 && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600">
                        {selectedDomains.length} dominio(s) seleccionado(s)
                      </p>
                      <button
                        onClick={handlePurchaseDomains}
                        disabled={status === 'loading'}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShoppingCartIcon className="h-4 w-4 mr-2" />
                        {status === 'loading' ? 'Verificando...' : 'Comprar Dominios'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Purchased Domains */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Mis Dominios</h3>
              </div>
              
              {purchasedDomains.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {purchasedDomains.map((domain) => (
                    <div key={domain.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {getStatusIcon(domain.status)}
                          <div className="ml-3">
                            <h4 className="text-lg font-medium text-gray-900">{domain.domain}</h4>
                            <p className="text-sm text-gray-600">
                              Comprado: {new Date(domain.purchaseDate).toLocaleDateString('es-ES')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(domain.status)}`}>
                            {domain.status === 'active' ? 'Activo' : 
                             domain.status === 'pending' ? 'Pendiente' : 'Expirado'}
                          </span>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              Expira: {new Date(domain.expiryDate).toLocaleDateString('es-ES')}
                            </p>
                            <p className="text-sm text-gray-600">
                              ${domain.price.toFixed(2)}/año
                            </p>
                          </div>
                          <div className="flex space-x-2">
                            <button className="p-2 text-gray-400 hover:text-gray-600" title="Ver detalles">
                              <EyeIcon className="h-4 w-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-gray-600" title="Configurar">
                              <Cog6ToothIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <GlobeAltIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No tienes dominios registrados</h3>
                  <p className="text-gray-600 mb-4">Busca y compra tu primer dominio para comenzar</p>
                  <button
                    onClick={() => {
                      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                      input?.focus();
                    }}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Buscar Dominios
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Domain Purchase Modal */}
      {showPurchaseModal && (
        <DomainPurchase
          selectedDomains={selectedDomains}
          onPurchase={handleConfirmPurchase}
          onCancel={() => setShowPurchaseModal(false)}
        />
      )}
    </div>
  );
}
