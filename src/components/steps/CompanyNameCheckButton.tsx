"use client";

import { useState } from "react";
import clsx from "clsx";

export default function CompanyNameCheckButton({
  getName,
  formationState,
  entityType,
}: {
  getName: () => string;
  formationState?: string;
  entityType?: "LLC" | "C-Corp";
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { status: "ok" | "warn" | "error"; message: string }>(null);

  const handleCheck = async () => {
    setResult(null);
    const name = (getName() || "").trim();
    if (!name) {
      setResult({ status: "warn", message: "Ingresa un nombre primero" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/check-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: name, entityType, formationState }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error en la verificación");

      if (data.skipped) {
        setResult({ status: "warn", message: data.message || "Solo compatible con Florida por ahora." });
      } else if (data.message) {
        // Use the simplified message directly from Lambda
        const isAvailable = data.available === true;
        setResult({ 
          status: isAvailable ? "ok" : "error", 
          message: data.message 
        });
      } else {
        setResult({ status: "warn", message: "No se pudo determinar. Intenta de nuevo más tarde." });
      }
    } catch (e) {
      setResult({ status: "error", message: e instanceof Error ? e.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={clsx(
          "btn btn-primary text-sm px-4 py-2",
          loading && "opacity-70 cursor-not-allowed"
        )}
        onClick={handleCheck}
        disabled={loading}
      >
        {loading ? "Revisando..." : "Revisar disponibilidad"}
      </button>
      {result && (
        <span
          className={clsx(
            "text-sm",
            result.status === "ok" && "text-green-600",
            result.status === "warn" && "text-amber-600",
            result.status === "error" && "text-red-600"
          )}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}


