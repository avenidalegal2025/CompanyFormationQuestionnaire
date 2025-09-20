// src/components/steps/Step1Intro.tsx
"use client";
import Image from "next/image";

export default function Step1Intro({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl">
        <Image src="/miami.jpg" alt="Miami" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <h1 className="text-white text-2xl sm:text-3xl font-semibold">
            Crea una empresa en Estados Unidos
          </h1>
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={onContinue}>
        Comenzar
      </button>
    </section>
  );
}