"use client";

import { useMemo, useState } from "react";
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
  const [showHelp, setShowHelp] = useState(false);

  const stateToUrl: Record<string, string> = {
    Arizona: "https://ecorp.azcc.gov/EntitySearch/Index",
    California: "https://bizfileonline.sos.ca.gov/search/business",
    Delaware: "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx",
    Florida: "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName",
    Georgia: "https://ecorp.sos.ga.gov/BusinessSearch",
    Nevada: "https://esos.nv.gov/EntitySearch/OnlineEntitySearch",
    "New Mexico": "https://enterprise.sos.nm.gov/search/business",
    Texas: "https://comptroller.texas.gov/taxes/franchise/account-status/search",
    Wyoming: "https://wyobiz.wyo.gov/Business/FilingSearch.aspx",
  };

  const instructions = useMemo(() => {
    const f = formationState || "";
    switch (f) {
      case "Arizona":
        return {
          title: "Cómo buscar nombres de empresa en Arizona",
          steps: [
            "Visita la búsqueda de entidades eCorp de la Comisión de Corporaciones de Arizona.",
            "Elige el tipo de búsqueda: Starts With, Contains o Exact Match.",
            "Ingresa todo o parte del nombre de tu empresa en Entity Name.",
            "Si hay más de 500 resultados, usa los filtros para acotar.",
            "Haz clic en Search para ver los resultados o en Name Availability Check para una verificación rápida.",
          ],
          url: stateToUrl[f],
        };
      case "California":
        return {
          title: "Cómo buscar nombres de empresa en California",
          steps: [
            "Visita California Business Search.",
            "Desplázate y escribe todo o parte del nombre en la barra de búsqueda.",
            "Abre Advanced Search.",
            "Filtra por palabra clave, coincidencia exacta o comienza con.",
            "Haz clic en Search.",
          ],
          url: stateToUrl[f],
        };
      case "Delaware":
        return {
          title: "Cómo buscar nombres de empresa en Delaware",
          steps: [
            "Visita General Information Name Search de Delaware.",
            "Ingresa todo o parte del nombre en Entity Name.",
            "Haz clic en Search.",
          ],
          url: stateToUrl[f],
        };
      case "Florida":
        return {
          title: "Cómo buscar nombres de empresa en Florida",
          steps: [
            "Visita la búsqueda de la División de Corporaciones de Florida.",
            "Ingresa todo o parte del nombre en Entity Name.",
            "Haz clic en Search Now.",
          ],
          url: stateToUrl[f],
        };
      case "Georgia":
        return {
          title: "Cómo buscar nombres de empresa en Georgia",
          steps: [
            "Visita Business Search de la División de Corporaciones de Georgia.",
            "Selecciona Starts With, Contains o Exact Match.",
            "Ingresa el nombre en Business Name.",
            "Haz clic en Search.",
          ],
          url: stateToUrl[f],
        };
      case "Nevada":
        return {
          title: "Cómo buscar nombres de empresa en Nevada",
          steps: [
            "Visita SilverFlume Business Search de Nevada.",
            "Elige Starts With, Contains, Exact Match o All Words.",
            "Ingresa el nombre. Si hay más de 500 resultados, acota la búsqueda.",
            "Haz clic en Search.",
          ],
          url: stateToUrl[f],
        };
      case "New Mexico":
        return {
          title: "Cómo buscar nombres de empresa en Nuevo México",
          steps: [
            "Visita New Mexico Business Search.",
            "Selecciona Starts With, Contains o Exact Match.",
            "Ingresa el nombre en Entity Name/DBA Name y completa el CAPTCHA.",
            "Haz clic en Search.",
          ],
          url: stateToUrl[f],
        };
      case "Texas":
        return {
          title: "Cómo buscar nombres de empresa en Texas",
          steps: [
            "Opción gratuita: usa Taxable Entity Search del Comptroller.",
            "Ingresa todo o parte del nombre en Entity Name.",
            "Completa el CAPTCHA y haz clic en Search.",
            "(Alternativa pagada: SoSDirect con inicio de sesión temporal o cuenta).",
          ],
          url: stateToUrl[f],
        };
      case "Wyoming":
        return {
          title: "Cómo buscar nombres de empresa en Wyoming",
          steps: [
            "Visita Business Entity Search de Wyoming.",
            "Ingresa el nombre en Filing Name.",
            "Elige Starts With o Contains y haz clic en Search.",
          ],
          url: stateToUrl[f],
        };
      default:
        return {
          title: "Cómo revisar disponibilidad",
          steps: [
            "Selecciona un estado para ver instrucciones específicas.",
          ],
          url: "",
        };
    }
  }, [formationState]);

  const handleCheck = async () => {
    setResult(null);
    const name = (getName() || "").trim();
    if (!name) {
      setResult({ status: "warn", message: "Ingresa un nombre primero" });
      return;
    }
    const url = formationState ? stateToUrl[formationState] : undefined;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      setResult({ status: "ok", message: "Abriendo el buscador oficial en una nueva pestaña…" });
    } else {
      setResult({ status: "warn", message: "Selecciona un estado compatible para abrir el buscador." });
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
      <button
        type="button"
        className="text-sm underline text-blue-600 hover:text-blue-700"
        onMouseEnter={() => setShowHelp(true)}
        onClick={() => setShowHelp(true)}
      >
        ¿Cómo buscar?
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

      {showHelp && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{instructions.title}</h3>
              <button className="text-gray-500 hover:text-gray-700" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
              {instructions.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {instructions.url && (
              <div className="mt-4">
                <a href={instructions.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  Abrir el buscador oficial
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


