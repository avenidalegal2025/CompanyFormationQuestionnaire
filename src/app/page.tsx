"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import ProgressSidebar from "@/components/ProgressSidebar";
import Step1Intro from "@/components/steps/Step1Intro";
import Step2Company from "@/components/steps/Step2Company";
import Step3Owners from "@/components/steps/Step3Owners";
import Step4Admin from "@/components/steps/Step4Admin";
import type { AllSteps } from "@/lib/schema";

export default function Home() {
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // RHF form instance (shared across steps)
  const form = useForm<AllSteps>({
    defaultValues: {
      company: {},
      owners: [],
      admin: {},
    },
  });

  // Sidebar items
  const items = [
    { key: "intro", label: "CREAR CUENTA", status: step === 1 ? "active" : step > 1 ? "done" : "todo" },
    { key: "company", label: "DATOS DE LA EMPRESA", status: step === 2 ? "active" : step > 2 ? "done" : "todo" },
    { key: "owners", label: "DATOS DE LOS PROPIETARIOS", status: step === 3 ? "active" : step > 3 ? "done" : "todo" },
    { key: "admin", label: "DATOS ADMINISTRATIVOS", status: step === 4 ? "active" : step > 4 ? "done" : "todo" },
  ];

  return (
    <div className="min-h-dvh grid grid-cols-1 md:grid-cols-[260px_auto]">
      {/* Sidebar */}
      <aside className="bg-white border-r border-gray-100 p-6 hidden md:block">
        <ProgressSidebar current={step} total={totalSteps} items={items} onGo={setStep} />
      </aside>

      {/* Main content */}
      <main className="px-4 md:px-8 py-6">
        <div className="max-w-3xl mx-auto">
          {step === 1 && <Step1Intro onContinue={() => setStep(2)} />}
          {step === 2 && <Step2Company form={form} setStep={setStep} />}
          {step === 3 && <Step3Owners form={form} setStep={setStep} />}
          {step === 4 && <Step4Admin form={form} setStep={setStep} />}
        </div>
      </main>
    </div>
  );
}