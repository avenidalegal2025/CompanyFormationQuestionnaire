// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Company Formation Questionnaire",
  description: "Guided onboarding to collect details to open your company.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50">
        <header className="bg-white border-b border-gray-100">
          <div className="px-4 md:px-8 py-3">
            <Image src="/logo.png" alt="Avenida Legal" width={160} height={40} priority />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}