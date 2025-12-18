"use client";

import { useState } from "react";
import Link from "next/link";

interface AdminCompany {
  id: string;
  companyName: string;
  entityType: string;
  formationState: string;
  formationStatus: string;
  paymentDate: string;
  customerEmail: string;
  vaultPath?: string;
}

export default function AdminCompaniesPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<AdminCompany | null>(null);
  const [uploading, setUploading] = useState<{
    [key: string]: boolean;
  }>({});
  const [message, setMessage] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const trimmed = query.trim();
    if (!trimmed) {
      setError("Escribe el nombre de la empresa o el email del cliente.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/admin/companies?query=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al buscar empresas");
      }

      setCompanies(data.companies || []);
      setSelectedCompany(null);
    } catch (err: any) {
      setError(err.message || "Error al buscar empresas");
    } finally {
      setLoading(false);
    }
  };

  const isCorporation = (company: AdminCompany | null) => {
    if (!company) return false;
    const t = (company.entityType || "").toLowerCase();
    return t.includes("corp") || t.includes("inc") || t.includes("corporation");
  };

  const isLLC = (company: AdminCompany | null) => {
    if (!company) return false;
    const t = (company.entityType || "").toLowerCase();
    return t.includes("llc") || t.includes("limited liability");
  };

  const handleUpload = async (docType: "ein" | "articles_inc" | "articles_llc", file: File) => {
    if (!selectedCompany) return;
    setMessage(null);

    const key = `${selectedCompany.id}:${docType}`;
    setUploading(prev => ({ ...prev, [key]: true }));

    try {
      const formData = new FormData();
      formData.append("recordId", selectedCompany.id);
      formData.append("docType", docType);
      formData.append("file", file);

      const res = await fetch("/api/admin/upload-company-doc", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al subir el documento");
      }

      setMessage("✅ Documento subido correctamente. Se verá en el dashboard del cliente.");
    } catch (err: any) {
      setMessage(`❌ ${err.message || "Error al subir el documento"}`);
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleFileChange =
    (docType: "ein" | "articles_inc" | "articles_llc") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        setMessage("El archivo debe ser un PDF.");
        return;
      }
      handleUpload(docType, file);
      // Reset input
      event.target.value = "";
    };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Panel de Abogado – Empresas
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Busca una empresa por nombre o email del cliente y sube el EIN y los Articles cuando estén listos.
        </p>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre de empresa o email del cliente..."
            className="flex-1 input"
          />
          <button
            type="submit"
            className="btn btn-primary whitespace-nowrap"
            disabled={loading}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
            {error}
          </div>
        )}

        {/* Results */}
        {companies.length > 0 && (
          <div className="mb-8 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Empresa</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Tipo</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Estado</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Cliente</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Pago</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {companies.map(company => {
                  const isSelected = selectedCompany?.id === company.id;
                  return (
                    <tr
                      key={company.id}
                      className={isSelected ? "bg-blue-50/60" : ""}
                    >
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">
                          {company.companyName}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{company.entityType}</td>
                      <td className="px-4 py-2 text-gray-700">{company.formationState}</td>
                      <td className="px-4 py-2 text-gray-700">
                        <span className="font-mono text-xs">{company.customerEmail}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {company.paymentDate || "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedCompany(company)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          {isSelected ? "Seleccionada" : "Seleccionar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload panel */}
        {selectedCompany && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Subir documentos para: {selectedCompany.companyName}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Tipo: <span className="font-medium">{selectedCompany.entityType}</span>{" "}
              · Estado: <span className="font-medium">{selectedCompany.formationState}</span>
            </p>

            <div className="space-y-4">
              {/* EIN upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  EIN Confirmation Letter (PDF)
                </label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange("ein")}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100
                    cursor-pointer"
                />
              </div>

              {/* Articles for corporations */}
              {isCorporation(selectedCompany) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Articles of Incorporation (PDF)
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFileChange("articles_inc")}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      cursor-pointer"
                  />
                </div>
              )}

              {/* Articles for LLCs */}
              {isLLC(selectedCompany) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Articles of Organization (PDF)
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFileChange("articles_llc")}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      cursor-pointer"
                  />
                </div>
              )}
            </div>

            {message && (
              <div className="mt-4 text-sm">
                <p className={message.startsWith("✅") ? "text-green-700" : "text-red-700"}>
                  {message}
                </p>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <p className="text-xs text-gray-500">
                Nota: Estos documentos se guardan en el vault de la empresa en S3 y se muestran
                automáticamente en el dashboard del cliente. Para Articles se actualizan también
                las columnas correspondientes en Airtable.
              </p>
              <p className="text-xs text-gray-500">
                Para ver cómo lo ve el cliente, abre su dashboard (requiere iniciar sesión como el
                cliente en otra ventana del navegador):
              </p>
              <Link
                href="/client"
                target="_blank"
                className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                Abrir dashboard de cliente en una nueva pestaña →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


