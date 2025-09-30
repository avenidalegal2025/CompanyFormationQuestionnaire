"use client";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";

export default function SignInPage() {
  // Safe auto-redirect: only when no error and we haven't already attempted
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const callbackUrl = params.get("callbackUrl") || "/";
    const hasError = !!params.get("error");
    const attemptKey = `auth_attempt_${callbackUrl}`;

    if (!hasError) {
      const attempted = sessionStorage.getItem(attemptKey);
      if (!attempted) {
        sessionStorage.setItem(attemptKey, "1");
        const providerUrl = `/api/auth/signin/auth0?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        window.location.replace(providerUrl);
      }
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md">
        <div className="bg-white shadow-sm rounded-2xl p-8 border border-gray-100">
          <div className="flex flex-col items-center text-center">
            <Image src="/logo.svg" alt="Avenida Legal" width={56} height={56} className="mb-3" />
            <h1 className="text-2xl font-semibold text-gray-900">Iniciar sesión</h1>
            <p className="text-sm text-gray-600 mt-1">Autentícate con tu cuenta para continuar.</p>
          </div>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                const callbackUrl = params.get("callbackUrl") || "/";
                void signIn("auth0", { callbackUrl });
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2.5 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              Continuar con Auth0
            </button>
            {/* Show error if present to avoid silent loops */}
            {typeof window !== 'undefined' && (() => {
              const params = new URLSearchParams(window.location.search);
              const err = params.get('error');
              return err ? (
                <p className="text-sm text-red-600 text-center">Error de autenticación: {err}. Intenta nuevamente.</p>
              ) : null;
            })()}
          </div>

          <p className="text-xs text-gray-500 mt-6 text-center">
            ¿Necesitas ayuda?{" "}
            <Link href="/" className="text-brand-600 hover:underline">Volver al inicio</Link>
          </p>
        </div>

        <p className="text-[11px] text-gray-400 mt-4 text-center">
          Al continuar aceptas nuestros Términos y la Política de Privacidad.
        </p>
      </div>
    </main>
  );
}