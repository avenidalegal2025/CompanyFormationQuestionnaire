"use client";

import { useState } from "react";
import Step1Profile from "@/components/steps/Step1Profile";
import Step2Company from "@/components/steps/Step2Company";
import Step3Owners from "@/components/steps/Step3Owners";
import Step4Admin from "@/components/steps/Step4Admin";
import ProgressSidebar, { type ProgressItem } from "@/components/ProgressSidebar";
import { useForm } from "react-hook-form";
import { type AllSteps } from "@/lib/schema";

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

  const [step, setStep] = useState(1);
  const totalSteps = 4;

  const items: ProgressItem[] = [
    {
      key: "step1",
      label: "Tu perfil",
      status: step === 1 ? "active" : step > 1 ? "done" : "todo",
    },
    {
      key: "step2",
      label: "Empresa",
      status: step === 2 ? "active" : step > 2 ? "done" : "todo",
    },
    {
      key: "step3",
      label: "Propietarios",
      status: step === 3 ? "active" : step > 3 ? "done" : "todo",
    },
    {
      key: "step4",
      label: "Administrativo",
      status: step === 4 ? "active" : step > 4 ? "done" : "todo",
    },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="bg-white border-r border-gray-100 p-6 hidden md:block">
        <ProgressSidebar
          current={step}
          total={totalSteps}
          items={items}
          onGo={setStep}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        <form
          onSubmit={form.handleSubmit((data) => {
            console.log("Final submit", data);
          })}
          className="space-y-6"
        >
          {step === 1 && <Step1Profile form={form} setStep={setStep} />}
          {step === 2 && <Step2Company form={form} setStep={setStep} />}
          {step === 3 && <Step3Owners form={form} setStep={setStep} />}
          {step === 4 && <Step4Admin form={form} setStep={setStep} />}
        </form>
      </main>
    </div>
  );
}