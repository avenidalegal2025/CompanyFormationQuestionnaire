"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

interface AdminCompany {
  id: string;
  companyName: string;
  entityType: string;
  formationState: string;
  customerEmail: string;
}

export default function AdminDocumentsPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AdminCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<AdminCompany | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"por-firmar" | "firmado" | "en-proceso">("por-firmar");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/companies?query=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (res.ok) {
          setSuggestions(data.companies || []);
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [query]);

  const fetchDocuments = async (recordId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/company-documents?recordId=${encodeURIComponent(recordId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al cargar documentos");
      }
      setSelectedCompany(data.company || null);
      setDocuments(data.documents || []);
    } catch (err: any) {
      setError(err.message || "Error al cargar documentos");
    } finally {
      setLoading(false);
    }
  };

  const selectCompany = (company: AdminCompany) => {
    setSelectedCompany(company);
    setQuery(company.companyName);
    setSuggestions([]);
    fetchDocuments(company.id);
  };

  const getEntityType = () => selectedCompany?.entityType || "";
  const isCorporation = () => {
    const lower = getEntityType().toLowerCase();
    return lower === "c-corp" ||
      lower === "s-corp" ||
      lower.includes("corp") ||
      lower.includes("inc") ||
      lower.includes("corporation");
  };
  const isLLC = () => {
    const lower = getEntityType().toLowerCase();
    return lower === "llc" ||
      lower === "l.l.c." ||
      lower.includes("llc") ||
      lower.includes("limited liability");
  };

  const categorizeDocument = (doc: any) => {
    const docIdLower = (doc.id || "").toLowerCase();

    if (docIdLower === "ein-letter" || docIdLower === "articles-inc" || docIdLower === "articles-llc") {
      return "firmado";
    }

    if (doc.signedS3Key || doc.status === "signed") {
      return "firmado";
    }

    const docName = (doc.name || "").toLowerCase();
    const isFormationDoc = docName.includes("membership registry") ||
      docName.includes("shareholder registry") ||
      docName.includes("organizational resolution") ||
      docName.includes("shareholder agreement") ||
      docName.includes("operating agreement") ||
      docName.includes("bylaws") ||
      docIdLower === "membership-registry" ||
      docIdLower === "shareholder-registry" ||
      docIdLower === "bylaws";

    if (isFormationDoc) {
      return "por-firmar";
    }

    if (doc.status === "generated" || doc.status === "pending_signature") {
      return "por-firmar";
    }

    if (doc.status === "template" || doc.status === "processing") {
      return "en-proceso";
    }

    return "por-firmar";
  };

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => categorizeDocument(doc) === activeTab);
  }, [documents, activeTab]);

  const hasDoc = (id: string) => {
    return documents.some(d => (d.id || "").toLowerCase().trim() === id.toLowerCase().trim() && (d.s3Key || d.signedS3Key));
  };
  const hasEin = hasDoc("ein-letter");
  const hasArticlesInc = hasDoc("articles-inc");
  const hasArticlesLlc = hasDoc("articles-llc");

  const handleDownload = (doc: any) => {
    const s3Key = doc.signedS3Key || doc.s3Key;
    if (!s3Key) return;
    const url = `/api/documents/view?key=${encodeURIComponent(s3Key)}`;
    window.open(url, "_blank");
  };

  const handleUploadSigned = async (documentId: string, file: File) => {
    if (!selectedCompany) return;
    try {
      setUploading(prev => ({ ...prev, [documentId]: true }));
      const formData = new FormData();
      formData.append("recordId", selectedCompany.id);
      formData.append("documentId", documentId);
      formData.append("file", file);

      const res = await fetch("/api/admin/upload-signed-document", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al subir documento firmado");
      }

      setDocuments(prev => prev.map(doc => doc.id === documentId ? data.document : doc));
      if (activeTab === "por-firmar") {
        setActiveTab("firmado");
      }
    } catch (err: any) {
      alert(err.message || "Error al subir documento firmado");
    } finally {
      setUploading(prev => ({ ...prev, [documentId]: false }));
    }
  };

  const handleFileSelect =
    (documentId: string) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        alert("El archivo debe ser un PDF.");
        return;
      }
      handleUploadSigned(documentId, file);
      event.target.value = "";
    };

  const handleUploadCompanyDoc = async (docType: "ein" | "articles_inc" | "articles_llc", file: File) => {
    if (!selectedCompany) return;
    try {
      const key = `${selectedCompany.id}:${docType}`;
      setUploading(prev => ({ ...prev, [key]: true }));
      const formData = new FormData();
      formData.append("recordId", selectedCompany.id);
      formData.append("docType", docType);
      formData.append("file", file);
      const res = await fetch("/api/admin/upload-company-doc", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al subir documento");
      await fetchDocuments(selectedCompany.id);
      setActiveTab("firmado");
    } catch (err: any) {
      alert(err.message || "Error al subir documento");
    } finally {
      const key = `${selectedCompany?.id}:${docType}`;
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleCompanyFileChange =
    (docType: "ein" | "articles_inc" | "articles_llc") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        alert("El archivo debe ser un PDF.");
        return;
      }
      handleUploadCompanyDoc(docType, file);
      event.target.value = "";
    };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Panel de Abogado – Documentos</h1>
          <p className="text-sm text-gray-600">
            Busca una empresa y gestiona todos sus documentos.
          </p>
        </div>

        <div className="relative mb-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar empresa o email del cliente..."
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          {suggestions.length > 0 && (
            <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
              {suggestions.map(company => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => selectCompany(company)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50"
                >
                  <div className="text-sm font-medium text-gray-900">{company.companyName}</div>
                  <div className="text-xs text-gray-500">{company.customerEmail}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
            {error}
          </div>
        )}

        {!selectedCompany && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
            Selecciona una empresa para ver sus documentos.
          </div>
        )}

        {selectedCompany && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm text-gray-700">
                <span className="font-semibold">{selectedCompany.companyName}</span>{" "}
                · {selectedCompany.entityType} · {selectedCompany.formationState}
              </div>
              <div className="text-xs text-gray-500">{selectedCompany.customerEmail}</div>
            </div>

            <div className="flex items-center gap-4 border-b border-gray-200">
              {["por-firmar", "firmado", "en-proceso"].map(tab => (
                <button
                  key={tab}
                  className={`px-2 pb-2 text-sm font-semibold ${
                    activeTab === tab ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"
                  }`}
                  onClick={() => setActiveTab(tab as any)}
                >
                  {tab === "por-firmar" ? "Por firmar" : tab === "firmado" ? "Completado" : "En proceso"}
                </button>
              ))}
            </div>

            {loading && (
              <div className="text-sm text-gray-500">Cargando documentos...</div>
            )}

            {!loading && activeTab === "en-proceso" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!hasEin && (
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <ClockIcon className="h-6 w-6 text-yellow-500" />
                      <div>
                        <div className="font-semibold text-gray-900">EIN Confirmation Letter</div>
                        <div className="text-sm text-gray-600">Sube el PDF cuando esté disponible.</div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <label className="btn btn-primary cursor-pointer">
                        Subir
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={handleCompanyFileChange("ein")}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled
                      >
                        Descargar
                      </button>
                    </div>
                  </div>
                )}
                {isCorporation() && !hasArticlesInc && (
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <ClockIcon className="h-6 w-6 text-yellow-500" />
                      <div>
                        <div className="font-semibold text-gray-900">Articles of Incorporation</div>
                        <div className="text-sm text-gray-600">Sube el PDF cuando esté disponible.</div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <label className="btn btn-primary cursor-pointer">
                        Subir
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={handleCompanyFileChange("articles_inc")}
                          className="hidden"
                        />
                      </label>
                      <button type="button" className="btn btn-secondary" disabled>
                        Descargar
                      </button>
                    </div>
                  </div>
                )}
                {isLLC() && !hasArticlesLlc && (
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <ClockIcon className="h-6 w-6 text-yellow-500" />
                      <div>
                        <div className="font-semibold text-gray-900">Articles of Organization</div>
                        <div className="text-sm text-gray-600">Sube el PDF cuando esté disponible.</div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <label className="btn btn-primary cursor-pointer">
                        Subir
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={handleCompanyFileChange("articles_llc")}
                          className="hidden"
                        />
                      </label>
                      <button type="button" className="btn btn-secondary" disabled>
                        Descargar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loading && activeTab !== "en-proceso" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDocuments.map(doc => (
                  <div key={doc.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <DocumentTextIcon className="h-6 w-6 text-blue-500" />
                        <div>
                          <div className="font-semibold text-gray-900">{doc.name || doc.id}</div>
                          <div className="text-xs text-gray-500">{doc.type || "documento"}</div>
                        </div>
                      </div>
                      {activeTab === "firmado" && (
                        <CheckCircleIcon className="h-6 w-6 text-green-600" />
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleDownload(doc)}
                      >
                        <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                        Descargar
                      </button>
                      <label className="btn btn-primary cursor-pointer">
                        <ArrowUpTrayIcon className="h-4 w-4 mr-1" />
                        {activeTab === "firmado" ? "Reemplazar firmado" : "Subir firmado"}
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={handleFileSelect(doc.id)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ))}
                {filteredDocuments.length === 0 && (
                  <div className="text-sm text-gray-500">No hay documentos en esta sección.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
