"use client";

import { useState } from "react";
import HeroMiami3 from "@/components/HeroMiami3";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

interface Step10GenerateAgreementProps extends StepProps {
  session: Session | null;
  anonymousId: string;
  draftId?: string;
}

export default function Step10GenerateAgreement({
  form,
  setStep,
  onSave,
  onNext,
  session,
  anonymousId,
  draftId,
}: Step10GenerateAgreementProps) {
  const { watch } = form;
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const entityType = watch("company.entityType");
  const isCorp = entityType === "C-Corp" || entityType === "S-Corp";
  const companyName =
    `${watch("company.companyNameBase") || ""} ${watch("company.entitySuffix") || ""}`.trim();
  const docTypeLabel = isCorp
    ? "Acuerdo de Accionistas (Shareholder Agreement)"
    : "Acuerdo Operativo (Operating Agreement)";

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      // Collect all form data
      const formData = form.getValues();

      const response = await fetch("/api/agreement/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData, draftId }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Error al generar el documento");
      }

      // Get the download URL from headers (if S3 upload succeeded)
      const s3Url = response.headers.get("X-Download-URL");
      if (s3Url) setDownloadUrl(s3Url);

      // Download the blob
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = isCorp
        ? "Shareholder_Agreement.docx"
        : "Operating_Agreement.docx";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = decodeURIComponent(match[1]);
      }

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setGenerated(true);
    } catch (err) {
      console.error("Agreement generation error:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="space-y-6">
      <HeroMiami3 title="Generar Acuerdo" />
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">
          Generar {docTypeLabel}
        </h2>
        <p className="mt-2 text-gray-600">
          Hemos recopilado toda la información necesaria para generar su acuerdo.
          Revise el resumen a continuación y haga clic en el botón para generar
          el documento.
        </p>

        {/* Summary */}
        <div className="mt-6 space-y-4">
          <div className="bg-gray-50 rounded-xl p-6 space-y-3">
            <h3 className="font-medium text-gray-900">Resumen</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Empresa:</span>{" "}
                <span className="font-medium">{companyName || "—"}</span>
              </div>
              <div>
                <span className="text-gray-500">Tipo:</span>{" "}
                <span className="font-medium">{entityType || "—"}</span>
              </div>
              <div>
                <span className="text-gray-500">Estado:</span>{" "}
                <span className="font-medium">
                  {watch("company.formationState") || "Florida"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Dueños:</span>{" "}
                <span className="font-medium">{watch("ownersCount") || 1}</span>
              </div>
              <div>
                <span className="text-gray-500">Venta de la empresa:</span>{" "}
                <span className="font-medium">
                  {isCorp
                    ? watch("agreement.corp_saleDecisionThreshold") || "—"
                    : watch("agreement.llc_companySaleDecision") || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Firmantes bancarios:</span>{" "}
                <span className="font-medium">
                  {isCorp
                    ? watch("agreement.corp_bankSigners") || "—"
                    : watch("agreement.llc_bankSigners") || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">ROFR:</span>{" "}
                <span className="font-medium">
                  {isCorp
                    ? watch("agreement.corp_rofr") === "Yes"
                      ? "Sí"
                      : "No"
                    : watch("agreement.llc_rofr") === "Yes"
                      ? "Sí"
                      : "No"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">No competencia:</span>{" "}
                <span className="font-medium">
                  {isCorp
                    ? watch("agreement.corp_nonCompete") === "Yes"
                      ? "Sí"
                      : "No"
                    : watch("agreement.llc_nonCompete") === "Yes"
                      ? "Sí"
                      : "No"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="mt-8 flex flex-col items-center gap-4">
          {!generated ? (
            <button
              type="button"
              className="btn btn-primary text-lg px-8 py-3"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Generando documento...
                </span>
              ) : (
                `Generar ${isCorp ? "Acuerdo de Accionistas" : "Acuerdo Operativo"}`
              )}
            </button>
          ) : (
            <div className="text-center space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-medium">
                  Documento generado exitosamente
                </span>
              </div>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline text-sm"
                >
                  Descargar de nuevo
                </a>
              )}
              <button
                type="button"
                className="btn text-sm"
                onClick={() => {
                  setGenerated(false);
                  setDownloadUrl(null);
                }}
              >
                Regenerar documento
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              <p className="font-medium">Error al generar el documento</p>
              <p className="mt-1">{error}</p>
              <button
                type="button"
                className="mt-2 text-red-600 underline text-sm"
                onClick={() => setError(null)}
              >
                Reintentar
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(8)}>
            Atrás
          </button>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-base underline text-blue-600"
              onClick={() =>
                handleSaveWithAuth(session, anonymousId, form, onSave)
              }
            >
              Guardar y continuar más tarde
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onNext?.()}
            >
              Continuar al pago
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
