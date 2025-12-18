"use client";

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ConfettiCelebration from '@/components/ConfettiCelebration';

// Helper function to check if any owner has SSN
function hasOwnerWithSSN(owners: any[] | undefined): boolean {
  if (!owners || !Array.isArray(owners)) return false;
  return owners.some(owner => owner?.tin && owner.tin.trim() !== '');
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState<string>('5-7 días');
  const [documentsReady, setDocumentsReady] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  // Start in "checking" mode so we DON'T briefly show the final
  // "¡Felicidades!" screen before the document check runs.
  const [checkingDocuments, setCheckingDocuments] = useState(true);
  const [documentProgress, setDocumentProgress] = useState(0);
  const [entityType, setEntityType] = useState<'LLC' | 'C-Corp' | 'S-Corp' | null>(null);
  const [documentsTimedOut, setDocumentsTimedOut] = useState(false);
  const [hasAgreementDoc, setHasAgreementDoc] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxWaitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnimationRef = useRef<NodeJS.Timeout | null>(null);

  // Check if documents are ready
  const checkDocumentsReady = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/documents');
      if (response.ok) {
        const data = await response.json();
        const documents = data.documents || [];
        
        // Check if we have at least some key documents generated
        // We expect at least SS-4, Membership Registry, and Organizational Resolution
        const keyDocuments = [
          'ss4-ein-application',
          'membership-registry',
          'shareholder-registry',
          'organizational-resolution',
          'bylaws',
        ];
        
        const hasKeyDocuments = keyDocuments.some(docId => 
          documents.some((doc: any) => doc.id === docId && (doc.s3Key || doc.status === 'generated' || doc.status === 'signed'))
        );

        // Track whether an agreement document exists (for checklist rendering)
        const hasAgreement = documents.some(
          (doc: any) =>
            doc.id === 'operating-agreement' ||
            doc.id === 'shareholder-agreement'
        );
        setHasAgreementDoc(hasAgreement);
        
        // Count generated documents for progress
        // Only update progress if it's higher than current (prevent going backwards)
        const generatedCount = documents.filter((doc: any) => 
          doc.s3Key || doc.status === 'generated' || doc.status === 'signed'
        ).length;
        
        const totalExpected = Math.max(documents.length, 3); // At least 3 key documents
        const progress = Math.min(100, Math.round((generatedCount / totalExpected) * 100));
        setDocumentProgress(prev => Math.max(prev, progress)); // Only go forward, never backward
        
        // Consider "ready" only if we have at least one key formation document
        return hasKeyDocuments;
      }
      return false;
    } catch (error) {
      console.error('Error checking documents:', error);
      return false;
    }
  };

  useEffect(() => {
    if (sessionId) {
      // Fetch session email and save to localStorage
      const fetchSessionEmail = async () => {
        try {
          const response = await fetch(`/api/session/email?session_id=${sessionId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.email) {
              localStorage.setItem('userEmail', data.email);
            }
          }
        } catch (error) {
          console.error('Error fetching session email:', error);
        }
      };

      fetchSessionEmail();
      
      // Set a flag in localStorage to indicate payment completion
      if (typeof window !== 'undefined') {
        localStorage.setItem('paymentCompleted', 'true');
        localStorage.setItem('paymentSessionId', sessionId);
        
        // Check formData from localStorage to determine processing time
        const savedData = localStorage.getItem('questionnaireData');
        if (savedData) {
          try {
            const formData = JSON.parse(savedData);
            const owners = formData?.owners || [];
            const hasSSN = hasOwnerWithSSN(owners);
            setProcessingTime(hasSSN ? '5-7 días' : '1 mes para tramitar el ITIN con el IRS');
            const type = formData?.company?.entityType as 'LLC' | 'C-Corp' | 'S-Corp' | undefined;
            if (type) {
              setEntityType(type);
            }
          } catch (error) {
            console.error('Error parsing saved data:', error);
          }
        }
      }
      
      setLoading(false);
      
      // Animate progress bar: 0% -> 20% -> 40% -> 60% -> 80% -> 100% (smoothly, one direction only)
      // Use a separate animated progress that only goes forward
      let animatedProgress = 0;
      const progressSteps = [20, 40, 60, 80, 100];
      let currentStep = 0;
      
      const animateProgress = () => {
        if (currentStep < progressSteps.length) {
          const targetProgress = progressSteps[currentStep];
          const duration = currentStep === progressSteps.length - 1 ? 2000 : 600; // Slower for final step
          const startProgress = animatedProgress;
          const startTime = Date.now();
          
          const updateProgress = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Simple ease-out for smooth animation
            const easedProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
            animatedProgress = Math.min(targetProgress, startProgress + (targetProgress - startProgress) * easedProgress);
            
            // Only update if animated progress is higher than current (prevent going backwards)
            setDocumentProgress(prev => Math.max(prev, Math.round(animatedProgress)));
            
            if (progress < 1) {
              progressAnimationRef.current = setTimeout(updateProgress, 16); // ~60fps
            } else {
              animatedProgress = targetProgress; // Ensure we reach the target
              setDocumentProgress(targetProgress);
              currentStep++;
              if (currentStep < progressSteps.length) {
                progressAnimationRef.current = setTimeout(animateProgress, 300); // Small delay between steps
              }
            }
          };
          
          updateProgress();
        }
      };
      
      // Start animation immediately
      setTimeout(() => animateProgress(), 500); // Small initial delay
      
      // Start checking for documents after a short delay (give webhook time to process)
      startCheckTimeoutRef.current = setTimeout(() => {
        let isReady = false;
        
        // Poll for documents every 2 seconds
        pollIntervalRef.current = setInterval(async () => {
          if (isReady) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            return;
          }
          
          const ready = await checkDocumentsReady();
          if (ready) {
            isReady = true;
            setDocumentsReady(true);
            setShowCelebration(true);
            setCheckingDocuments(false);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (maxWaitTimeoutRef.current) {
              clearTimeout(maxWaitTimeoutRef.current);
              maxWaitTimeoutRef.current = null;
            }
          }
        }, 2000);
        
        // Stop polling after 60 seconds max (documents should be ready by then)
        maxWaitTimeoutRef.current = setTimeout(() => {
          if (!isReady) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            // Documents are taking longer than expected – mark timeout so UI
            // can show a "still processing" state instead of claiming
            // everything is ready.
            setDocumentsTimedOut(true);
            setCheckingDocuments(false);
          }
        }, 60000);
      }, 2000);
      
      return () => {
        if (startCheckTimeoutRef.current) {
          clearTimeout(startCheckTimeoutRef.current);
        }
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        if (maxWaitTimeoutRef.current) {
          clearTimeout(maxWaitTimeoutRef.current);
        }
        if (progressAnimationRef.current) {
          clearTimeout(progressAnimationRef.current);
        }
      };
    } else {
      setError('No session ID found');
      setLoading(false);
    }
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Procesando tu pago...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-pink-100">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error de Pago</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Regresar al Inicio
          </Link>
        </div>
      </div>
    );
  }

  const isCorp = entityType === 'C-Corp' || entityType === 'S-Corp';
  
  // Get accurate document list based on entity type
  const getDocumentList = () => {
    const baseDocs = [
      '✓ Formulario SS-4 (EIN Application)',
      '✓ Formularios 2848 y 8821',
    ];
    
    if (isCorp) {
      // Corporation documents
      return [
        ...baseDocs,
        '✓ Shareholder Registry',
        '✓ Bylaws',
        '✓ Organizational Resolution',
        ...(hasAgreementDoc ? ['✓ Shareholder Agreement'] : []),
      ];
    } else {
      // LLC documents
      return [
        ...baseDocs,
        '✓ Membership Registry',
        '✓ Organizational Resolution',
        ...(hasAgreementDoc ? ['✓ Operating Agreement'] : []),
      ];
    }
  };

  const createdText =
    entityType === 'LLC'
      ? 'Tu LLC ha sido creada exitosamente'
      : isCorp
      ? 'Tu corporación ha sido creada exitosamente'
      : 'Tu empresa ha sido creada exitosamente';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
      <ConfettiCelebration active={showCelebration} duration={8000} />
      
      <div className="max-w-md w-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 text-center relative z-10 border border-white/20">
        {checkingDocuments && !documentsReady ? (
          <>
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto mb-4 relative">
                <div className="absolute inset-0 rounded-full border-4 border-blue-200"></div>
                <div 
                  className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"
                  style={{ animationDuration: '1s' }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl">📄</span>
                </div>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Estamos preparando tus documentos…</h1>
              <p className="text-gray-600 mb-6">
                Tu pago fue recibido correctamente. Ahora estamos generando todos los documentos de tu empresa.
              </p>
              
              {/* Progress bar */}
              <div className="mb-4">
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${documentProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 mt-2">{documentProgress}% completado</p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                <p className="text-sm text-blue-800">
                  <span className="inline-block animate-pulse">⏳</span> Generando documentos de formación...
                </p>
              </div>
            </div>
          </>
        ) : !documentsReady && documentsTimedOut ? (
          <>
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto mb-4 relative">
                <div className="absolute inset-0 rounded-full border-4 border-amber-200"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl">⏳</span>
                </div>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Tu pago fue recibido correctamente</h1>
              <p className="text-gray-600 mb-4">
                Estamos terminando de procesar la formación de tu empresa y generando tus documentos.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Esto puede tardar unos minutos adicionales. Te avisaremos por email cuando todo esté listo.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
                <p className="text-sm text-amber-800">
                  Puedes entrar a tu Hub Empresarial ahora, pero es posible que algunos documentos aún no aparezcan.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <Link
                href="/client"
                className="block w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
              >
                Ir a Mi Hub Empresarial →
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6">
              <div className="text-6xl mb-4 animate-bounce">🎉</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">¡Felicidades! 🎊</h1>
              <p className="text-lg text-gray-700 mb-2 font-semibold">
                {createdText}
              </p>
              <p className="text-gray-600 mb-6">
                Todos tus documentos están listos y disponibles en tu dashboard.
              </p>
            </div>
            
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h2 className="font-semibold text-blue-900 mb-2">✅ Documentos Listos</h2>
              <ul className="text-sm text-blue-800 text-left space-y-1">
                {getDocumentList().map((doc, index) => (
                  <li key={index}>{doc}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <Link
                href="/client"
                className="block w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
              >
                Ir a Mi Hub Empresarial →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccess() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}

