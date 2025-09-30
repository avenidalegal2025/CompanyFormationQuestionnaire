"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import Step2Company from "@/components/steps/Step2Company";
import Step3Owners from "@/components/steps/Step3Owners";
import Step4Summary from "@/components/steps/Step4Summary";
import Step6Agreement1 from "@/components/steps/Step6Agreement1";
import Step7Agreement2 from "@/components/steps/Step7Agreement2";
import Step8Agreement3 from "@/components/steps/Step8Agreement3";
import Step9Agreement4 from "@/components/steps/Step9Agreement4";
import Step5Admin from "@/components/steps/Step5Admin";
import ProgressSidebar, { type ProgressItem } from "@/components/ProgressSidebar";

import type { AllSteps } from "@/lib/schema";
import { saveDraft, loadDraft, type DraftItem } from "@/lib/drafts";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Page() {
  const form = useForm<AllSteps>({
    defaultValues: {
      profile: {},     // kept in schema but unused in UI (email comes from Auth0)
      company: {},
      owners: [],
      ownersCount: 1,
      admin: {},
      banking: {},
      attachments: {},
    },
  });

  // We now have a 4-step flow (2, 3, 4, 5)
  const [step, setStep] = useState<number>(1);
  const [wantsAgreement, setWantsAgreement] = useState<boolean>(false);
  const totalSteps = wantsAgreement ? 8 : 4;

  // If arriving from a short link, prefill the form from localStorage
  useEffect(() => {
    try {
      const collab = typeof window !== 'undefined' ? window.localStorage.getItem('collabData') : null;
      const collabDraftId = typeof window !== 'undefined' ? window.localStorage.getItem('collabDraftId') : null;
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
      const isCorp = entityType === "C-Corp";
      const t1 = "Dueños & Roles";
      const t2 = "Capital & Préstamos";
      const t3 = "Gobierno & Decisiones";
      const t4 = isCorp ? "Acciones & Sucesión" : "Acciones & Sucesión";
      base.push(
        { key: "step-ag-1", label: t1, status: step === 5 ? "active" : step > 5 ? "done" : "todo" },
        { key: "step-ag-2", label: t2, status: step === 6 ? "active" : step > 6 ? "done" : "todo" },
        { key: "step-ag-3", label: t3, status: step === 7 ? "active" : step > 7 ? "done" : "todo" },
        { key: "step-ag-4", label: t4, status: step === 8 ? "active" : "todo" },
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
    const intervalId = window.setInterval(async () => {
      try {
        const res = await loadDraft(draftId);
        const remoteUpdatedAt = res.item?.updatedAt as number | undefined;
        if (res.item?.data && typeof remoteUpdatedAt === 'number') {
          // Only refresh if remote is newer than what we've seen and newer than our last local save
          const localLast = lastSavedAt ?? 0;
          if (remoteUpdatedAt > lastRemoteUpdatedAt && remoteUpdatedAt > localLast) {
            form.reset(res.item.data);
            setLastRemoteUpdatedAt(remoteUpdatedAt);
            // Show collaborator snackbar if viewer-only or if data changed externally
            setCollabNotice("Otro usuario está editando este cuestionario en este momento.");
            if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
            noticeTimerRef.current = window.setTimeout(() => setCollabNotice(null), 4000);
          } else if (lastRemoteUpdatedAt === 0) {
            // Initialize baseline without forcing a reset
            setLastRemoteUpdatedAt(remoteUpdatedAt);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 4000);
    return () => window.clearInterval(intervalId);
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
            <Step2Company form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} />
          )}
          {step === 2 && (
            <Step3Owners form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} />
          )}
          {step === 3 && (
            <Step5Admin form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} />
          )}
          {step === 4 && (
            <Step4Summary form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} setWantsAgreement={setWantsAgreement} />
          )}
          {wantsAgreement && step === 5 && (
            <Step6Agreement1 form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} />
          )}
          {wantsAgreement && step === 6 && (
            <Step7Agreement2 form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} />
          )}
          {wantsAgreement && step === 7 && (
            <Step8Agreement3 form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} />
          )}
          {wantsAgreement && step === 8 && (
            <Step9Agreement4 form={form} setStep={setStep} onSave={onGuardarYContinuar} onNext={onContinuar} />
          )}
        </form>
      </main>
    </div>
  );
}