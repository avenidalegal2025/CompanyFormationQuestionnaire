"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import Step1Profile from "@/components/steps/Step1Profile";
import Step2Company from "@/components/steps/Step2Company";
import Step3Owners from "@/components/steps/Step3Owners";
import Step4Admin from "@/components/steps/Step4Admin";
import ProgressSidebar, { type ProgressItem } from "@/components/ProgressSidebar";
import type { AllSteps } from "@/lib/schema";
import { saveDraft, loadDraft } from "@/lib/drafts";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Page() {
  const form = useForm<AllSteps>({
    defaultValues: {
      profile: {},
      company: {},
      owners: [],
      admin: {},
      banking: {},
      attachments: {},
    },
  });

  const [step, setStep] = useState<number>(1);
  const totalSteps = 4;

  // persistent draft id (stored in localStorage)
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // progress sidebar items
  const items: ProgressItem[] = useMemo(
    () => [
      { key: "step1", label: "Tu perfil",        status: step === 1 ? "active" : step > 1 ? "done" : "todo" },
      { key: "step2", label: "Empresa",          status: step === 2 ? "active" : step > 2 ? "done" : "todo" },
      { key: "step3", label: "Propietarios",     status: step === 3 ? "active" : step > 3 ? "done" : "todo" },
      { key: "step4", label: "Administrativo",   status: step === 4 ? "active" : "todo" },
    ],
    [step]
  );

  // Load existing draft on first mount (if any)
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("draftId") : null;
    if (!stored) return;

    (async () => {
      try {
        const res = await loadDraft(stored);
        if (res.item?.data) {
          form.reset(res.item.data);
          setDraftId(res.item.id);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save helper (returns the draft id)
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

  // Autosave every 30s
  useEffect(() => {
    const id: number = window.setInterval(() => {
      // avoid autosave spam right after a manual save
      if (saveState === "saving") return;
      doSave().catch(() => setSaveState("error"));
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, form, saveState]);

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
        <ProgressSidebar current={step} total={totalSteps} items={items} onGo={setStep} />
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        {/* tiny status bar */}
        <div className="mb-4 text-xs text-gray-500">
          {loadError && <span className="text-red-600">Error al cargar: {loadError}</span>}
          {!loadError && (
            <>
              <span>ID del borrador: {draftId ?? "nuevo"}</span>
              {" • "}
              <span>
                estado:{" "}
                {saveState === "idle" && "inactivo"}
                {saveState === "saving" && "guardando…"}
                {saveState === "saved" && (lastSavedAt ? `guardado ${new Date(lastSavedAt).toLocaleTimeString()}` : "guardado")}
                {saveState === "error" && <span className="text-red-600">error</span>}
              </span>
            </>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            // final submit could also do a doSave() and then route to a review page
            void onContinuar();
          }}
          className="space-y-6"
        >
          {step === 1 && (
            <Step1Profile
              form={form}
              setStep={setStep}
              onSave={onGuardarYContinuar}
              onNext={onContinuar}
            />
          )}
          {step === 2 && (
            <Step2Company
              form={form}
              setStep={setStep}
              onSave={onGuardarYContinuar}
              onNext={onContinuar}
            />
          )}
          {step === 3 && (
            <Step3Owners
              form={form}
              setStep={setStep}
              onSave={onGuardarYContinuar}
              onNext={onContinuar}
            />
          )}
          {step === 4 && (
            <Step4Admin
              form={form}
              setStep={setStep}
              onSave={onGuardarYContinuar}
              onNext={onContinuar}
            />
          )}
        </form>
      </main>
    </div>
  );
}