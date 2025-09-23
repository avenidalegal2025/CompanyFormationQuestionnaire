import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";

export const metadata: Metadata = {
  title: "Avenida Legal — Company Formation Questionnaire",
  description: "Questionnaire to create your U.S. company.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server component wrapping a client provider is OK in the App Router
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}