"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";

import Step1Profile from "@/components/steps/Step1Profile";
import Step2Company from "@/components/steps/Step2Company";
import Step3Owners from "@/components/steps/Step3Owners";
import Step4Admin from "@/components/steps/Step4Admin";
import ProgressSidebar, { type ProgressItem } from "@/components/ProgressSidebar";

import type { AllSteps } from "@/lib/schema";
import { saveDraft, loadDraft } from "@/lib/drafts";

export default function Page() {
  const { data: session, status } = useSession();
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // Stable per-user draft id (email preferred, fallback to sub)
  const draftId = useMemo(() => {
    const u = session?.user as any;
    return (u?.email as string) || (u?.id as string) || (u?.sub as string) || "";
  }, [session]);

  const form = useForm<AllSteps>({
    defaultValues: {
      profile: {},
      company: {},
      owners: [],
      admin: {},
      banking: {},
      attachments: {},
    },
    mode: "onChange",
  });

  const items: ProgressItem[] = [
    { key: "step1", label: "Tu perfil",        status: step === 1 ? "active" : step > 1 ? "done" : "todo" },
    { key: "step2", label: "Empresa",          status: step === 2 ? "active" : step > 2 ? "done" : "todo" },
    { key: "step3", label: "Propietarios",     status: step === 3 ? "active" : step > 3 ? "done" : "todo" },
    { key: "step4", label: "Administrativo",   status: step === 4 ? "active" : step > 4 ? "done" : "todo" },
  ];

  // Load any existing draft on mount
  useEffect(() => {
    if (!draftId) return; // not logged in yet
    loadDraft(draftId)
      .then((res) => {
        if (res.item?.data) {
          form.reset(res.item.data);
          // Optional: jump to last step user was on, if you store it
          // setStep(res.item.data?.__meta?.lastStep ?? 1);
        }
      })
      .catch((err) => {
        // No draft yet is fine—avoid noisy alerts
        console.debug("No existing draft to load:", err?.message || err);
      });
  }, [draftId, form]);

  // Auto-save every 30s (only when logged in)
  useEffect(() => {
    if (!draftId) return;
    const interval = setInterval(() => {
      const values = form.getValues();
      saveDraft(draftId, values).catch((err) =>
        console.error("Auto-save failed:", err)
      );
    }, 30_000);
    return () => clearInterval(interval);
  }, [draftId, form]);

  async function handleSave(nextStep?: number) {
    try {
      if (!draftId) {
        alert("Debes iniciar sesión antes de guardar.");
        return;
      }
      const values = form.getValues();
      await saveDraft(draftId, values);
      if (typeof nextStep === "number") setStep(nextStep);
      // Tiny toast/notification
      console.log("Draft saved");
    } catch (err: any) {
      console.error(err);
      alert(`No se pudo guardar: ${err?.message || String(err)}`);
    }
  }

  // Gate UI until session is known to avoid firing fetches while logged-out
  if (status === "loading") {
    return <div className="p-6">Cargando…</div>;
  }
  if (!draftId) {
    // You said middleware already forces login; this is just a friendly fallback
    return (
      <div className="p-6">
        Debes iniciar sesión para continuar.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="bg-white border-r border-gray-100 p-6 hidden md:block">
        <ProgressSidebar current={step} total={totalSteps} items={items} onGo={setStep} />
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        <form
          onSubmit={form.handleSubmit(async (data) => {
            await saveDraft(draftId, data);
            alert("Guardado final");
            // …then navigate to review/checkout, etc.
          })}
          className="space-y-6"
        >
          {step === 1 && <Step1Profile form={form} setStep={setStep} />}
          {step === 2 && <Step2Company form={form} setStep={setStep} />}
          {step === 3 && <Step3Owners form={form} setStep={setStep} />}
          {step === 4 && <Step4Admin form={form} setStep={setStep} />}

          {/* Footer actions */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => handleSave()} // stay on same step
              className="rounded-lg border px-4 py-2"
            >
              Guardar y continuar después
            </button>

            <button
              type="button"
              onClick={() => handleSave(Math.min(step + 1, totalSteps))}
              className="rounded-lg bg-brand-600 text-white px-4 py-2"
            >
              Continuar
            </button>

            {step === totalSteps && (
              <button
                type="submit"
                className="ml-auto rounded-lg bg-black text-white px-4 py-2"
              >
                Enviar
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}