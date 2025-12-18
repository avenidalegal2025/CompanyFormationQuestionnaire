"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { getAuth0SignupUrl } from "@/lib/auth0-client";

import Step2Company from "@/components/steps/Step2Company";
import Step3Owners from "@/components/steps/Step3Owners";
import Step4Summary from "@/components/steps/Step4Summary";
import Step6Agreement1 from "@/components/steps/Step6Agreement1";
import Step7Agreement2 from "@/components/steps/Step7Agreement2";
import Step8Agreement3 from "@/components/steps/Step8Agreement3";
import Step9Agreement4 from "@/components/steps/Step9Agreement4";
import Step5Admin from "@/components/steps/Step5Admin";
import Step10Checkout from "@/components/steps/Step10Checkout";
import ProgressSidebar, { type ProgressItem } from "@/components/ProgressSidebar";

import type { AllSteps } from "@/lib/schema";
import { saveDraft, loadDraft, type DraftItem } from "@/lib/drafts";

type SaveState = "idle" | "saving" | "saved" | "error";

function QuestionnaireContent() {
  // Session management
  const { data: session, status } = useSession();
  const isSignedUp = status === 'authenticated';
  
  // Default form values - used for resetting
  const defaultFormValues: AllSteps = {
    profile: {},     // kept in schema but unused in UI (email comes from Auth0)
    company: {},
    owners: [],
    ownersCount: undefined, // Start empty, will default to 1 for rendering
    admin: {
      officersAllOwners: "Yes", // Default to "Yes" so role assignment section shows on load
      directorsAllOwners: "Yes", // Default to "Yes" for consistency
    },
    banking: {},
    attachments: {},
  };
  
  // Initialize form
  const form = useForm<AllSteps>({
    defaultValues: defaultFormValues,
  });

  // We now have a 4-step flow (2, 3, 4, 5)
  const [step, setStep] = useState<number>(1);
  const [wantsAgreement, setWantsAgreement] = useState<boolean>(false);
  const totalSteps = wantsAgreement ? 9 : 5;
  // Store the beforeunload handler so we can remove it before intentional navigation
  const beforeUnloadHandlerRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);
  
  // Anonymous draft management
  const [anonymousId, setAnonymousId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('anonymousDraftId') || crypto.randomUUID();
    }
    return crypto.randomUUID();
  });

  // Custom close warning modal state

  // Browser close warning for unsigned users
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSignedUp && step > 1) {
        e.preventDefault();
        e.returnValue = 'Si sales antes de registrarte perderás toda tu información.';
        return 'Si sales antes de registrarte perderás toda tu información.';
      }
      return undefined;
    };
    
    beforeUnloadHandlerRef.current = handleBeforeUnload;
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      beforeUnloadHandlerRef.current = null;
    };
  }, [isSignedUp, step]);

  // Handle post-signup actions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check for callback URL in localStorage first
    const storedCallbackUrl = localStorage.getItem('authCallbackUrl');
    if (isSignedUp && storedCallbackUrl) {
      // Clear the stored callback URL
      localStorage.removeItem('authCallbackUrl');
      
      // Parse the callback URL
      const url = new URL(storedCallbackUrl, window.location.origin);
      const action = url.searchParams.get('action');
      const draftId = url.searchParams.get('draftId');
      const step = url.searchParams.get('step');
      
      // Handle the action
      if (action === 'save') {
        alert('¡Progreso guardado!');
      } else if (action === 'share') {
        // Trigger share modal (will be handled by ProgressSidebar)
        // Note: This will be handled by ProgressSidebar component
      } else if (action === 'checkout') {
        setStep(9);
      } else if (action === 'continue' && step) {
        setStep(parseInt(step, 10));
      }
    }
    
    // Also check URL params for backward compatibility
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const draftId = urlParams.get('draftId');
    
    if (isSignedUp && action && draftId) {
      // Clear URL params
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('action');
      newUrl.searchParams.delete('draftId');
      window.history.replaceState({}, '', newUrl.toString());
      
      // Handle the action
      if (action === 'save') {
        alert('¡Progreso guardado!');
      } else if (action === 'share') {
        // Trigger share modal (will be handled by ProgressSidebar)
        // Note: This will be handled by ProgressSidebar component
      } else if (action === 'checkout') {
        setStep(9);
      } else if (action === 'continue') {
        const targetStep = urlParams.get('step');
        if (targetStep) {
          setStep(parseInt(targetStep, 10));
        }
      }
    }
    
    // Additional check: if user is signed up and we have anonymous data, restore it
    if (isSignedUp) {
      const anonymousData = localStorage.getItem('anonymousDraftData');
      if (anonymousData) {
        console.log('Post-signup: Found anonymous data, restoring...', anonymousData);
        try {
          const parsed = JSON.parse(anonymousData) as Partial<AllSteps>;
          form.reset(parsed);
          console.log('Post-signup: Form reset with anonymous data. New form values:', form.getValues());
          // Clear the anonymous data after restoring
          localStorage.removeItem('anonymousDraftData');
          localStorage.removeItem('anonymousDraftId');
        } catch (error) {
          console.error('Post-signup: Error parsing anonymous data:', error);
        }
      }
    }
  }, [isSignedUp, form]);

  // Check if this is a new company creation - if so, reset form completely
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check for newCompany query parameter or localStorage flag
    const urlParams = new URLSearchParams(window.location.search);
    const isNewCompany = urlParams.get('newCompany') === 'true' || 
                        localStorage.getItem('newCompany') === 'true';
    
    if (isNewCompany) {
      console.log('🆕 New company creation detected - resetting form completely and clearing ALL cached data');
      
      // CRITICAL: Clear ALL possible localStorage items that might contain cached data
      const keysToRemove = [
        'questionnaireData',
        'selectedCompanyId',
        'draftId',
        'anonymousDraftId',
        'anonymousDraftData',
        'collabData',
        'collabDraftId',
        'paymentCompleted',
        'newCompany',
        'authCallbackUrl',
        // Clear any other potential cached data
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Also clear any sessionStorage items
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('Could not clear sessionStorage:', e);
      }
      
      // Reset form to default values - use deep reset to ensure all nested fields are cleared
      form.reset(defaultFormValues, {
        keepDefaultValues: false, // Don't keep any default values
        keepErrors: false, // Clear errors
        keepDirty: false, // Clear dirty state
        keepIsSubmitted: false, // Clear submitted state
        keepTouched: false, // Clear touched state
        keepIsValid: false, // Clear validation state
        keepSubmitCount: false, // Clear submit count
      });
      
      // Reset step to 1
      setStep(1);
      setWantsAgreement(false);
      
      // Generate new anonymous ID to prevent any ID collision
      const newAnonymousId = crypto.randomUUID();
      setAnonymousId(newAnonymousId);
      
      // Clear the flag
      localStorage.removeItem('newCompany');
      
      // Remove newCompany from URL without reload
      urlParams.delete('newCompany');
      const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
      
      console.log('✅ Form completely reset - all cached data cleared');
      return; // Don't load any draft data for new company
    }
  }, [form, defaultFormValues]);

  // If arriving from a short link, prefill the form from localStorage
  useEffect(() => {
    try {
      const collab = typeof window !== 'undefined' ? window.localStorage.getItem('collabData') : null;
      const collabDraftId = typeof window !== 'undefined' ? window.localStorage.getItem('collabDraftId') : null;
      const anonymousData = typeof window !== 'undefined' ? window.localStorage.getItem('anonymousDraftData') : null;
      
      // Skip loading draft data if this is a new company
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const isNewCompany = urlParams?.get('newCompany') === 'true' || 
                          (typeof window !== 'undefined' && localStorage.getItem('newCompany') === 'true');
      if (isNewCompany) {
        return; // Don't load any draft data for new company
      }
      
      if (collab) {
        const parsed = JSON.parse(collab) as Partial<AllSteps>;
        form.reset({
          ...form.getValues(),
          ...parsed,
        });
        // Respect edit permissions if needed in future (perms === 'edit')
        // Do not immediately remove, keep for refreshes in the same session
        if (collabDraftId) {
          setDraftId(collabDraftId);
          if (typeof window !== 'undefined') window.localStorage.setItem('draftId', collabDraftId);
        }
      } else if (collabDraftId) {
        // If only draftId is present, load from DB now
        (async () => {
          try {
            const res = await loadDraft(collabDraftId);
            if (res.item?.data) {
              form.reset(res.item.data);
              const item = res.item as DraftItem;
              const idFromItem = item.draftId ?? item.id ?? collabDraftId;
              setDraftId(idFromItem);
              if (typeof window !== 'undefined') window.localStorage.setItem('draftId', idFromItem);
            }
          } catch {
            // ignore
          }
        })();
      } else if (anonymousData) {
        // Restore anonymous draft data after authentication
        console.log('Restoring anonymous draft data:', anonymousData);
        const parsed = JSON.parse(anonymousData) as Partial<AllSteps>;
        console.log('Parsed anonymous data:', parsed);
        form.reset(parsed);
        console.log('Form reset with anonymous data. New form values:', form.getValues());
        // Clear the anonymous data after restoring
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('anonymousDraftData');
          window.localStorage.removeItem('anonymousDraftId');
        }
      }
    } catch {}
  }, [form]);

  // Share functionality
  const handleSendInvites = async (emails: string[]) => {
    try {
      // First generate a magic link (legacy)
      const formData = form.getValues();
      const linkResponse = await fetch('/api/share/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, draftId, permissions: 'view' }),
      });
      
      if (!linkResponse.ok) {
        throw new Error('Failed to generate magic link');
      }
      
      const { magicLink } = await linkResponse.json();
      
      // Then send emails with the magic link
      const emailResponse = await fetch('/api/share/send-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          emails, 
          magicLink,
          inviterName: 'Avenida Legal'
        }),
      });
      
      if (!emailResponse.ok) {
        throw new Error('Failed to send emails');
      }
      
      const result = await emailResponse.json();
      
      if (result.sandboxMode) {
        // Return the result for the modal to handle
        return result;
      } else {
        alert(result.message);
        return result;
      }
      
    } catch (error) {
      console.error('Error sending invites:', error);
      alert('Error al enviar invitaciones. Por favor, inténtalo de nuevo.');
      throw error;
    }
  };

  const handleGenerateLink = async (): Promise<string> => {
    try {
      const formData = form.getValues();
      const response = await fetch('/api/share/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, draftId, permissions: 'view' }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate magic link');
      }
      
      const { magicLink } = await response.json();
      return magicLink;
      
    } catch (error) {
      console.error('Error generating magic link:', error);
      throw error;
    }
  };

  // Draft lifecycle
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRemoteUpdatedAt, setLastRemoteUpdatedAt] = useState<number>(0);
  const [collabNotice, setCollabNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const items: ProgressItem[] = useMemo(() => {
    const entityType = form.watch("company.entityType");
    const base: ProgressItem[] = [
      { key: "step-company",  label: "Empresa",        status: step === 1 ? "active" : step > 1 ? "done" : "todo" },
      { key: "step-owners",   label: "Propietarios",   status: step === 2 ? "active" : step > 2 ? "done" : "todo" },
      { key: "step-admin",    label: "Administrativo", status: step === 3 ? "active" : step > 3 ? "done" : "todo" },
      { key: "step-summary",  label: "Resumen",        status: step === 4 ? "active" : step > 4 ? "done" : "todo" },
    ];
    if (wantsAgreement) {
      const isCorp = entityType === "C-Corp" || entityType === "S-Corp";
      const t1 = "Dueños & Roles";
      const t2 = "Capital & Préstamos";
      const t3 = "Gobierno & Decisiones";
      const t4 = isCorp ? "Acciones & Sucesión" : "Acciones & Sucesión";
      base.push(
        { key: "step-ag-1", label: t1, status: step === 5 ? "active" : step > 5 ? "done" : "todo" },
        { key: "step-ag-2", label: t2, status: step === 6 ? "active" : step > 6 ? "done" : "todo" },
        { key: "step-ag-3", label: t3, status: step === 7 ? "active" : step > 7 ? "done" : "todo" },
        { key: "step-ag-4", label: t4, status: step === 8 ? "active" : step > 8 ? "done" : "todo" },
        { key: "step-checkout", label: "Checkout", status: step === 9 ? "active" : step > 9 ? "done" : "todo" },
      );
    }
    return base;
  }, [step, wantsAgreement, form]);

  // Load existing draft on mount (if any). If collaboration data/draftId exist, skip this to avoid overwriting.
  useEffect(() => {
    const collabDraftId = typeof window !== "undefined" ? window.localStorage.getItem("collabDraftId") : null;
    const collabData = typeof window !== "undefined" ? window.localStorage.getItem("collabData") : null;
    if (collabDraftId || collabData) return;

    const stored = typeof window !== "undefined" ? window.localStorage.getItem("draftId") : null;
    if (!stored) return;

    (async () => {
      try {
        const res = await loadDraft(stored);
        if (res.item?.data) {
          form.reset(res.item.data);

          // Accept either {draftId} or {id} from the API item
          const item = res.item as DraftItem;
          const idFromItem = item.draftId ?? item.id ?? stored;
          setDraftId(idFromItem);
          const updatedAt = (res.item as DraftItem).updatedAt;
          if (typeof updatedAt === 'number') {
            setLastRemoteUpdatedAt(updatedAt);
          }
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save helper
  const doSave = async (): Promise<string> => {
    setSaveState("saving");
    const data = form.getValues();
    const result = await saveDraft(draftId, data);
    setSaveState("saved");
    setLastSavedAt(Date.now());
    if (!draftId || result.id !== draftId) {
      setDraftId(result.id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("draftId", result.id);
      }
    }
    return result.id;
  };

  // Debounced save on form changes for quicker sync
  useEffect(() => {
    const sub = form.watch(() => {
      const timer = window.setTimeout(() => {
        if (saveState !== "saving") {
          void doSave();
        }
      }, 1000);
      return () => window.clearTimeout(timer);
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, draftId]);

  // Autosave every 8s (faster propagation)
  useEffect(() => {
    const id: number = window.setInterval(() => {
      if (saveState === "saving") return;
      doSave().catch(() => setSaveState("error"));
    }, 8_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, form, saveState]);

  // Collaborative polling: refresh form if another user saved newer data (every 4s)
  useEffect(() => {
    if (!draftId) return;
    
    let intervalId: number | null = null;
    let hasInitialized = false;
    
    // Start polling after a 3-second delay to avoid false positives
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(async () => {
        try {
          const res = await loadDraft(draftId);
          const remoteUpdatedAt = res.item?.updatedAt as number | undefined;
          if (res.item?.data && typeof remoteUpdatedAt === 'number') {
            // Initialize baseline on first poll without showing notice
            if (!hasInitialized) {
              setLastRemoteUpdatedAt(remoteUpdatedAt);
              hasInitialized = true;
              return;
            }
            
            // Only refresh if remote is newer than what we've seen and newer than our last local save
            const localLast = lastSavedAt ?? 0;
            const timeDiff = remoteUpdatedAt - lastRemoteUpdatedAt;
            
            // Only show notice if there's a significant time difference (more than 2 seconds)
            // and it's not from our own recent save
            if (timeDiff > 2000 && remoteUpdatedAt > localLast) {
              form.reset(res.item.data);
              setLastRemoteUpdatedAt(remoteUpdatedAt);
              // Show collaborator snackbar only if there's actual external editing
              setCollabNotice("Otro usuario está editando este cuestionario en este momento.");
              // Keep the notice visible as long as remote edits continue. Hide only after inactivity.
              const INACTIVITY_MS = 30000; // 30s without remote updates hides the notice
              if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
              noticeTimerRef.current = window.setTimeout(() => setCollabNotice(null), INACTIVITY_MS);
            }
          }
        } catch {
          // ignore polling errors
        }
      }, 5000); // Increased interval to 5 seconds to reduce false positives
    }, 3000);
    
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [draftId, lastSavedAt, lastRemoteUpdatedAt, form]);

  // Button handlers
  const onGuardarYContinuar = async () => {
    try {
      await doSave();
    } catch {
      setSaveState("error");
    }
  };

  const onContinuar = async () => {
    try {
      await doSave();
      
      // Check if user needs to sign up (for any step after 1)
      if (step > 1 && !isSignedUp) {
        // Save anonymous draft and redirect to signup
        const formData = form.getValues();
        if (typeof window !== 'undefined') {
          localStorage.setItem('anonymousDraftId', anonymousId);
          localStorage.setItem('anonymousDraftData', JSON.stringify(formData));
          localStorage.setItem('authCallbackUrl', `/?action=continue&draftId=${anonymousId}&step=${step + 1}`);
          
          // Remove beforeunload listener to prevent the "Leave site?" dialog
          if (beforeUnloadHandlerRef.current) {
            window.removeEventListener('beforeunload', beforeUnloadHandlerRef.current);
          }
        }
        // Redirect directly to Auth0 signup
        window.location.href = getAuth0SignupUrl('');
        return;
      }
      
      setStep((s) => Math.min(totalSteps, s + 1));
    } catch {
      setSaveState("error");
    }
  };


  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="bg-white border-r border-gray-100 p-6 hidden md:block">
        <ProgressSidebar
          current={step}
          total={totalSteps}
          items={items}
          onGo={setStep}
          onSendInvites={handleSendInvites}
          onGenerateLink={handleGenerateLink}
          session={session}
          anonymousId={anonymousId}
          form={form}
        />
      </aside>

      {/* Main */}
      <main className="flex-1 p-6">
        {collabNotice && (
          <div className="fixed top-4 right-4 z-[9999] bg-amber-500 text-white px-4 py-2 rounded shadow-lg">
            {collabNotice}
          </div>
        )}
        {/* status bar */}
        <div className="mb-4 text-xs text-gray-500">
          {loadError ? (
            <span className="text-red-600">Error al cargar: {loadError}</span>
          ) : (
            <>
              <span>ID del borrador: {draftId ?? "nuevo"}</span>
              {" • "}
              <span>
                estado:{" "}
                {saveState === "idle" && "inactivo"}
                {saveState === "saving" && "guardando…"}
                {saveState === "saved" &&
                  (lastSavedAt ? `guardado ${new Date(lastSavedAt).toLocaleTimeString()}` : "guardado")}
                {saveState === "error" && <span className="text-red-600">error</span>}
              </span>
            </>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onContinuar();
          }}
          className="space-y-6"
        >
          {step === 1 && (
            <Step2Company form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} session={session} anonymousId={anonymousId} />
          )}
          {step === 2 && (
            <Step3Owners form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} session={session} anonymousId={anonymousId} />
          )}
          {step === 3 && (
            <Step5Admin form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} session={session} anonymousId={anonymousId} />
          )}
          {step === 4 && (
            <Step4Summary form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} setWantsAgreement={setWantsAgreement} session={session} anonymousId={anonymousId} />
          )}
          {wantsAgreement && step === 5 && (
            <Step6Agreement1 form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} session={session} anonymousId={anonymousId} />
          )}
          {wantsAgreement && step === 6 && (
            <Step7Agreement2 form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} session={session} anonymousId={anonymousId} />
          )}
          {wantsAgreement && step === 7 && (
            <Step8Agreement3 form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} session={session} anonymousId={anonymousId} />
          )}
          {wantsAgreement && step === 8 && (
            <Step9Agreement4 form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} session={session} anonymousId={anonymousId} />
          )}
          {step === 9 && (
            <Step10Checkout form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} session={session} anonymousId={anonymousId} />
          )}
        </form>
      </main>
    </div>
  );
}

export default function Page() {
  return <QuestionnaireContent />;
}
