"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";

type Provider = {
  id: string;
  name: string;
  type: "oauth" | "email" | "credentials";
  signinUrl: string;
  callbackUrl: string;
};

export default function SignInPage() {
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Use NextAuth’s built-in providers endpoint (works in App Router)
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        setProviders(data ?? {});
      })
      .catch(() => {
        if (!mounted) return;
        setProviders({});
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const providerOrder = (provId: string) => {
    // Small UX nicety to show common IdPs first; others come after
    const order = ["auth0", "cognito", "google", "github", "azure-ad"];
    const i = order.indexOf(provId);
    return i === -1 ? 999 : i;
  };

  const renderIcon = (id: string) => {
    // Optional: tiny icon hint per IdP; fallback to a generic key icon
    if (id === "auth0") return <span aria-hidden>🔐</span>;
    if (id === "cognito") return <span aria-hidden>🟣</span>;
    if (id === "google") return <span aria-hidden>🟢</span>;
    if (id === "github") return <span aria-hidden>⚫</span>;
    return <span aria-hidden>🔑</span>;
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md">
        <div className="bg-white shadow-sm rounded-2xl p-8 border border-gray-100">
          <div className="flex flex-col items-center text-center">
            <Image
              src="/logo.svg"
              alt="Avenida Legal"
              width={56}
              height={56}
              className="mb-3"
            />
            <h1 className="text-2xl font-semibold text-gray-900">Iniciar sesión</h1>
            <p className="text-sm text-gray-600 mt-1">
              Autentícate con tu cuenta para continuar.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            {loading && (
              <div className="text-center text-sm text-gray-500">Cargando opciones…</div>
            )}

            {!loading && providers && Object.keys(providers).length === 0 && (
              <div className="text-center text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                No se encontraron proveedores de autenticación. Verifica tu configuración de NextAuth.
              </div>
            )}

            {!loading &&
              providers &&
              Object.values(providers)
                .sort((a, b) => providerOrder(a.id) - providerOrder(b.id))
                .map((p) => {
                  if (p.type === "oauth") {
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => signIn(p.id, { callbackUrl: "/" })}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2.5 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {renderIcon(p.id)}
                        <span>Continuar con {p.name}</span>
                      </button>
                    );
                  }

                  if (p.type === "email") {
                    // You can wire an email input + signIn("email") here if you enable Email provider
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => signIn("email")}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-gray-900 px-4 py-2.5 hover:bg-gray-50"
                      >
                        {renderIcon(p.id)}
                        <span>Continuar con Email</span>
                      </button>
                    );
                  }

                  if (p.type === "credentials") {
                    // If you add a Credentials provider, build a small form and call signIn("credentials", { ... })
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => signIn("credentials")}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-gray-900 px-4 py-2.5 hover:bg-gray-50"
                      >
                        {renderIcon(p.id)}
                        <span>Continuar</span>
                      </button>
                    );
                  }

                  return null;
                })}
          </div>

          <p className="text-xs text-gray-500 mt-6 text-center">
            ¿Necesitas ayuda?{" "}
            <Link href="/" className="text-brand-600 hover:underline">
              Volver al inicio
            </Link>
          </p>
        </div>

        <p className="text-[11px] text-gray-400 mt-4 text-center">
          Al continuar aceptas nuestros Términos y la Política de Privacidad.
        </p>
      </div>
    </main>
  );
}