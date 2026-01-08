"use client";

import { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';

interface Company {
  id: string;
  companyName: string;
  entityType: string;
  formationState: string;
  formationStatus: string;
  createdAt: string;
  customerEmail: string;
}

interface CompanySwitcherProps {
  userEmail: string;
  selectedCompanyId: string | null;
  onCompanyChange: (companyId: string) => void;
}

export default function CompanySwitcher({ userEmail, selectedCompanyId, onCompanyChange }: CompanySwitcherProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userEmail) {
      fetchCompanies();
    }
  }, [userEmail]);

  // Also refetch when component mounts to catch newly created companies
  // And refetch when paymentCompleted flag is detected
  useEffect(() => {
    if (userEmail) {
      const paymentCompleted = localStorage.getItem('paymentCompleted');
      if (paymentCompleted === 'true') {
        // Payment was just completed, wait a bit for webhook to process
        // Then refetch to get the new company
        console.log('💳 Payment completed detected, will refetch companies in 3 seconds...');
        const timer = setTimeout(() => {
          fetchCompanies();
        }, 3000);
        return () => clearTimeout(timer);
      } else {
        // No payment, just do a quick refetch to ensure we have latest data
        const timer = setTimeout(() => {
          fetchCompanies();
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:74',message:'fetchCompanies entry',data:{userEmail,selectedCompanyId,propSelectedCompanyId:selectedCompanyId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const response = await fetch(`/api/companies?email=${encodeURIComponent(userEmail)}`);
      if (response.ok) {
        const data = await response.json();
        const companiesList = data.companies || [];
        
        // Log all companies received from API
        console.log(`📊 Companies received from API: ${companiesList.length}`);
        companiesList.forEach((c: Company, index: number) => {
          console.log(`  ${index + 1}. ${c.companyName} (ID: ${c.id}, Created: ${c.createdAt})`);
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:80',message:'Companies fetched from API',data:{count:companiesList.length,companies:companiesList.map((c:Company)=>({id:c.id,name:c.companyName,createdAt:c.createdAt}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (companiesList.length === 0) {
          console.warn(`⚠️ No companies found for email: ${userEmail}`);
          console.warn(`💡 Check:`);
          console.warn(`   1. Is the email correct?`);
          console.warn(`   2. Do the companies in Airtable have the exact same Customer Email?`);
          console.warn(`   3. Check the server logs for API errors`);
        }
        
        setCompanies(companiesList);
        
        // Always consider the newest company (sorted by Payment Date desc)
        const newestCompany = companiesList[0];
        const paymentCompleted = localStorage.getItem('paymentCompleted');
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:86',message:'Before selection logic',data:{newestCompanyId:newestCompany?.id,newestCompanyName:newestCompany?.companyName,newestCreatedAt:newestCompany?.createdAt,selectedCompanyId,paymentCompleted,userSelectedCompanyId:localStorage.getItem('userSelectedCompanyId')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion

        // Helper to select and persist newest
        const selectNewest = () => {
          if (!newestCompany) return;
          console.log('✅ Selecting newest company:', newestCompany.id);
          console.log('📋 Available companies:', companiesList.map((c: Company) => ({ id: c.id, name: c.companyName })));
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:88',message:'selectNewest called',data:{newestCompanyId:newestCompany.id,newestCompanyName:newestCompany.companyName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          onCompanyChange(newestCompany.id);
          localStorage.setItem('selectedCompanyId', newestCompany.id);
          localStorage.removeItem('paymentCompleted');
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:94',message:'selectNewest completed',data:{selectedCompanyIdSet:localStorage.getItem('selectedCompanyId')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
        };

        // CRITICAL: Always default to newest company unless user has explicitly selected a different one
        // Priority: 1) Payment completed -> newest, 2) No selection -> newest, 3) Selection missing -> newest, 4) Selection older -> newest
        // Only keep current selection if it exists AND is the newest OR user explicitly selected it (not auto-selected)
        if (newestCompany) {
          const selectedCompany = companiesList.find((c: Company) => c.id === selectedCompanyId);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:101',message:'Company comparison',data:{selectedCompanyId,selectedCompanyFound:!!selectedCompany,selectedCompanyCreatedAt:selectedCompany?.createdAt,newestCompanyCreatedAt:newestCompany?.createdAt,selectedDateMs:selectedCompany?new Date(selectedCompany.createdAt).getTime():null,newestDateMs:new Date(newestCompany.createdAt).getTime()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          const selectedIsOld =
            selectedCompany &&
            newestCompany &&
            new Date(selectedCompany.createdAt).getTime() < new Date(newestCompany.createdAt).getTime();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:105',message:'Age comparison result',data:{selectedIsOld},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion

          // Check if there's a user preference flag (set when user manually selects a company)
          const userSelectedCompany = localStorage.getItem('userSelectedCompanyId');
          const isUserSelected = userSelectedCompany === selectedCompanyId;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:109',message:'User selection check',data:{userSelectedCompany,isUserSelected},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion

          // CRITICAL: If payment completed, ALWAYS select newest company (highest priority)
          if (paymentCompleted === 'true') {
            // Payment just completed - ALWAYS select newest, ignore any existing selection
            console.log('💳 Payment completed - FORCING selection of newest company');
            console.log('📋 Current selectedCompanyId:', selectedCompanyId);
            console.log('📋 Newest company ID:', newestCompany.id);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:113',message:'Branch: paymentCompleted - FORCING newest',data:{willSelectNewest:true,currentSelected:selectedCompanyId,newestId:newestCompany.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            selectNewest();
            localStorage.removeItem('userSelectedCompanyId'); // Clear user selection flag
            return; // Exit early - don't check other conditions
          } else if (!selectedCompanyId) {
            // No selection at all - select newest
            console.log('📋 No company selected - selecting newest');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:119',message:'Branch: no selectedCompanyId',data:{willSelectNewest:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            selectNewest();
          } else if (!selectedCompany) {
            // Selected company doesn't exist anymore - select newest
            console.log('⚠️ Selected company not found - selecting newest');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:123',message:'Branch: selectedCompany not found',data:{willSelectNewest:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            selectNewest();
          } else if (selectedIsOld) {
            // Selected company is older than newest - ALWAYS select newest (unless user explicitly selected the old one)
            if (!isUserSelected) {
            console.log('🔄 Selected company is older than newest - selecting newest');
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:128',message:'Branch: selectedIsOld and not userSelected',data:{willSelectNewest:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
            selectNewest();
            } else {
              console.log('👤 User explicitly selected older company, keeping selection');
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:131',message:'Branch: selectedIsOld but userSelected',data:{willSelectNewest:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
            }
          } else if (selectedCompany.id === newestCompany.id) {
            // Already selected newest - ensure it's persisted
            console.log('✅ Already selected newest company');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:135',message:'Branch: already newest',data:{willSelectNewest:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            localStorage.setItem('selectedCompanyId', newestCompany.id);
          } else {
            // Selected company exists but is not newest - only keep if user explicitly selected it
            if (!isUserSelected) {
              console.log('🔄 Selected company is not newest - selecting newest');
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:141',message:'Branch: not newest and not userSelected',data:{willSelectNewest:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              selectNewest();
            } else {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/20b3c4ee-700a-4d96-a79c-99dd33f4960a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CompanySwitcher.tsx:143',message:'Branch: not newest but userSelected',data:{willSelectNewest:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
            }
          }
        }
      } else {
        console.error('Failed to fetch companies');
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);
  
  const getCompanyDisplayName = (company: Company) => {
    const name = company.companyName;
    // Use full company name including entity type (e.g., "BEBE Corp a Florida company")
    const state = company.formationState || '';
    
    if (state) {
      return `${name} a ${state} company`.trim();
    } else {
      return name;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
      case 'Filed':
        return 'bg-green-100 text-green-700';
      case 'In Progress':
        return 'bg-blue-100 text-blue-700';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <BuildingOfficeIcon className="h-5 w-5 animate-pulse" />
        <span>Cargando empresas...</span>
      </div>
    );
  }

  if (companies.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors"
      >
        <BuildingOfficeIcon className="h-5 w-5 text-brand-600 flex-shrink-0" />
        <span className="flex-1 text-left truncate">
          {selectedCompany ? getCompanyDisplayName(selectedCompany) : 'Seleccionar empresa'}
        </span>
        <ChevronDownIcon className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-2 w-full min-w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900">Mis Empresas</h3>
              <p className="text-xs text-gray-500 mt-1">{companies.length} {companies.length === 1 ? 'empresa' : 'empresas'}</p>
            </div>
            <div className="overflow-y-auto max-h-80">
              {companies.map((company) => {
                const isSelected = company.id === selectedCompanyId;
                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => {
                      // Mark as user-selected when user manually clicks
                      localStorage.setItem('userSelectedCompanyId', company.id);
                      onCompanyChange(company.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-brand-50 border-l-4 border-brand-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          isSelected ? 'text-brand-900' : 'text-gray-900'
                        }`}>
                          {getCompanyDisplayName(company)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(company.createdAt).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(company.formationStatus)}`}>
                        {company.formationStatus}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

