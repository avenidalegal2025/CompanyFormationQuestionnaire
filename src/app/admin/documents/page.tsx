"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

const ADMIN_SEEN_COMPANY_IDS_KEY = "admin-seen-company-ids";

function getSeenIdsFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ADMIN_SEEN_COMPANY_IDS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

interface AdminCompany {
  id: string;
  companyName: string;
  entityType: string;
  formationState: string;
  customerEmail: string;
  paymentDate: string;
}

/**
 * Format a date string into a friendly readable format.
 * If time info is present: "8:45am 17th of May, 2027"
 * If date-only (e.g. "2027-05-17"): "17th of May, 2027"
 */
function formatFriendlyDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  try {
    // Detect if the string has time information (contains T or a colon for HH:MM)
    const hasTime = /T|\d{2}:\d{2}/.test(dateStr);

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    // Day with ordinal suffix
    const day = date.getUTCDate();
    const suffix =
      day === 11 || day === 12 || day === 13
        ? "th"
        : day % 10 === 1
        ? "st"
        : day % 10 === 2
        ? "nd"
        : day % 10 === 3
        ? "rd"
        : "th";

    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();

    if (!hasTime) {
      return `${day}${suffix} of ${month}, ${year}`;
    }

    // Hours & minutes (local time when time info is present)
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    const timeStr = minutes === 0
      ? `${hours}${ampm}`
      : `${hours}:${String(minutes).padStart(2, "0")}${ampm}`;

    return `${timeStr} ${day}${suffix} of ${month}, ${year}`;
  } catch {
    return dateStr;
  }
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
  const [latestCompanies, setLatestCompanies] = useState<AdminCompany[]>([]);
  const [latestLoading, setLatestLoading] = useState(false);
  const [recentListTab, setRecentListTab] = useState<"all" | "new" | "seen">("all");
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSeenIds(getSeenIdsFromStorage());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLatestLoading(true);
    fetch("/api/admin/companies?latest=50")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.companies) setLatestCompanies(data.companies);
      })
      .catch(() => {
        if (!cancelled) setLatestCompanies([]);
      })
      .finally(() => {
        if (!cancelled) setLatestLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    // Don’t show suggestions when the query matches the selected company (keeps dropdown closed after selection)
    if (selectedCompany && trimmed === selectedCompany.companyName.trim()) {
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
  }, [query, selectedCompany?.id, selectedCompany?.companyName]);

  const fetchDocuments = async (recordId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/admin/company-documents?recordId=${encodeURIComponent(recordId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al cargar documentos");
      }
      setSelectedCompany(data.company || null);
      setDocuments(data.documents || []);
    } catch (err: any) {
      if (!options?.silent) setError(err.message || "Error al cargar documentos");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  // Auto-refresh documents while a company is selected so client uploads appear without manual refresh
  useEffect(() => {
    if (!selectedCompany?.id) return;
    const interval = setInterval(() => {
      fetchDocuments(selectedCompany.id, { silent: true });
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedCompany?.id]);

  const selectCompany = (company: AdminCompany) => {
    setSuggestions([]);
    setSelectedCompany(company);
    setQuery(company.companyName);
    searchInputRef.current?.blur();
    fetchDocuments(company.id);
  };

  const markCompanyAsSeen = (recordId: string) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      next.add(recordId);
      try {
        localStorage.setItem(ADMIN_SEEN_COMPANY_IDS_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const selectLatestCompany = (company: AdminCompany) => {
    selectCompany(company);
    markCompanyAsSeen(company.id);
  };

  const newCompanies = useMemo(
    () => latestCompanies.filter((c) => !seenIds.has(c.id)),
    [latestCompanies, seenIds]
  );
  const seenCompanies = useMemo(
    () => latestCompanies.filter((c) => seenIds.has(c.id)),
    [latestCompanies, seenIds]
  );
  const recentList = recentListTab === "all" ? latestCompanies : recentListTab === "new" ? newCompanies : seenCompanies;

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

  const isDocumentSigned = (doc: any) =>
    !!(doc.signedS3Key || doc.status === "signed" || doc.signedAt);

  const categorizeDocument = (doc: any) => {
    const docIdLower = (doc.id || "").toLowerCase();

    if (docIdLower === "ein-letter" || docIdLower === "articles-inc" || docIdLower === "articles-llc") {
      return "firmado";
    }

    if (isDocumentSigned(doc)) {
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

      // Optimistic update: mark this doc as signed so it leaves "Por firmar" and appears only in "Completado"
      const updated = data.document;
      if (updated?.id) {
        setDocuments(prev =>
          prev.map(d =>
            d.id === updated.id
              ? { ...d, signedS3Key: updated.signedS3Key, status: "signed" as const, signedAt: updated.signedAt }
              : d
          )
        );
      }
      if (activeTab === "por-firmar") {
        setActiveTab("firmado");
      }
      await fetchDocuments(selectedCompany.id);
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
                ref={searchInputRef}
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

        <div className="mb-6 rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="flex border-b border-gray-200">
            {([
              { key: "all" as const, label: "Empresas Formadas" },
              { key: "new" as const, label: "Nuevo" },
              { key: "seen" as const, label: "Vistos anteriormente" },
            ]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRecentListTab(tab.key)}
                className={`flex-1 px-4 py-3 text-sm font-medium ${
                  recentListTab === tab.key
                    ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {tab.label}
                {tab.key === "new" && newCompanies.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 min-w-[1.25rem]">
                    {newCompanies.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="p-3 max-h-96 overflow-y-auto">
            {latestLoading ? (
              <p className="text-sm text-gray-500">Cargando últimas empresas…</p>
            ) : recentList.length === 0 ? (
              <p className="text-sm text-gray-500">
                {recentListTab === "all"
                  ? "No hay empresas formadas aún."
                  : recentListTab === "new"
                  ? "No hay empresas nuevas en la lista."
                  : "No hay empresas vistas aún. Haz clic en una empresa de la pestaña Nuevo para marcarla como vista."}
              </p>
            ) : (
              <ul className="space-y-1">
                {recentList.map((company) => (
                  <li key={company.id}>
                    <button
                      type="button"
                      onClick={() => selectLatestCompany(company)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-100 ${
                        selectedCompany?.id === company.id ? "bg-blue-50 text-blue-700" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-gray-900">{company.companyName}</span>
                          <span className="text-gray-500 ml-1">
                            · {company.entityType} · {company.formationState}
                          </span>
                        </div>
                        {company.paymentDate && (
                          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                            {formatFriendlyDate(company.paymentDate)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{company.customerEmail}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">{selectedCompany.companyName}</span>{" "}
                    · {selectedCompany.entityType} · {selectedCompany.formationState}
                  </div>
                  <div className="text-xs text-gray-500">{selectedCompany.customerEmail}</div>
                </div>
                <div className="flex items-center gap-2" />
              </div>
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
                {filteredDocuments.map(doc => {
                  const signed = isDocumentSigned(doc);
                  return (
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
                          <CheckCircleIcon className="h-6 w-6 text-green-600 shrink-0" />
                        )}
                      </div>
                      <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
                        <li className="flex items-center gap-2">
                          {(doc.s3Key || doc.signedS3Key) ? (
                            <CheckCircleIcon className="h-4 w-4 text-green-600 shrink-0" />
                          ) : (
                            <span className="h-4 w-4 rounded border-2 border-gray-300 shrink-0" />
                          )}
                          <span className={doc.s3Key || doc.signedS3Key ? "line-through text-gray-500" : ""}>
                            1. Descargar
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          {signed ? (
                            <CheckCircleIcon className="h-4 w-4 text-green-600 shrink-0" />
                          ) : (
                            <span className="h-4 w-4 rounded border-2 border-gray-300 shrink-0" />
                          )}
                          <span className={signed ? "line-through text-gray-500" : ""}>
                            2. Firmar
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          {signed ? (
                            <CheckCircleIcon className="h-4 w-4 text-green-600 shrink-0" />
                          ) : (
                            <span className="h-4 w-4 rounded border-2 border-gray-300 shrink-0" />
                          )}
                          <span className={signed ? "line-through text-gray-500" : ""}>
                            3. Subir firmado
                          </span>
                        </li>
                      </ul>
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
                  );
                })}
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
