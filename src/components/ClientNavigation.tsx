"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CompanySwitcher from '@/components/CompanySwitcher';
import {
  HomeIcon,
  DocumentTextIcon,
  ShoppingBagIcon,
  UserIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';

interface ClientNavigationProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export default function ClientNavigation({ currentTab, onTabChange }: ClientNavigationProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const email = localStorage.getItem('userEmail') || '';
    setUserEmail(email);
    const companyId = localStorage.getItem('selectedCompanyId');
    if (companyId) {
      setSelectedCompanyId(companyId);
    }
  }, []);

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    localStorage.setItem('selectedCompanyId', companyId);
    // Mark as user-selected when user manually changes company
    localStorage.setItem('userSelectedCompanyId', companyId);
    window.location.reload(); // Reload to refresh data
  };

  const handleLogout = () => {
    // Clear all authentication data
    localStorage.removeItem('hasCompletedPayment');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('questionnaireData');
    localStorage.removeItem('paymentCompleted');
    localStorage.removeItem('paymentSessionId');
    
    // Redirect to home page
    router.push('/');
  };

  const getCompanyDisplayName = () => {
    if (typeof window === 'undefined') return 'Mi Empresa';
    
    const savedData = localStorage.getItem('questionnaireData');
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        const { companyName, entityType, formationState } = data.company || {};
        
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
      } catch (error) {
        console.error('Error parsing saved data:', error);
      }
    }
    return 'Mi Empresa';
  };

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: HomeIcon, href: '/client' },
    { id: 'documents', name: 'Documentos', icon: DocumentTextIcon, href: '/client/documents' },
    { id: 'domains', name: 'Dominios', icon: GlobeAltIcon, href: '/client/domains' },
    { id: 'services', name: 'Servicios Adicionales', icon: ShoppingBagIcon, href: '/client/services' },
    { id: 'profile', name: 'Perfil', icon: UserIcon, href: '/client/profile' },
  ];

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden">
        <button
          type="button"
          className="bg-white p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <span className="sr-only">Open sidebar</span>
          {isMobileMenuOpen ? (
            <XMarkIcon className="h-6 w-6" />
          ) : (
            <Bars3Icon className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-soft transform ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      } transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="flex items-center justify-between h-20 px-6 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Mi Hub</h1>
            <button
              className="lg:hidden text-gray-400 hover:text-gray-600"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Company Switcher */}
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Empresa</h2>
            {userEmail ? (
              <CompanySwitcher
                userEmail={userEmail}
                selectedCompanyId={selectedCompanyId}
                onCompanyChange={handleCompanyChange}
              />
            ) : (
              <p className="text-sm font-medium text-gray-900 truncate">{getCompanyDisplayName()}</p>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigation.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    onTabChange(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl2 transition-all ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 ${
                      isActive ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-500'
                    }`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="px-4 py-6 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="group flex items-center w-full px-4 py-3 text-sm font-medium text-gray-600 rounded-xl2 hover:bg-gray-50 hover:text-gray-900 transition-all"
            >
              <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
}
