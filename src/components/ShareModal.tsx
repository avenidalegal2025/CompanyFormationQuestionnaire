"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendInvites: (emails: string[]) => Promise<{
    success: boolean;
    message: string;
    sandboxMode?: boolean;
    magicLink?: string;
    instructions?: string;
  }>;
  onGenerateLink: () => Promise<string>;
}

export default function ShareModal({ isOpen, onClose, onSendInvites, onGenerateLink }: ShareModalProps) {
  const [emails, setEmails] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [magicLink, setMagicLink] = useState<string>("");
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pre-generate magic link when modal opens
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        setIsLoading(true);
        const link = await onGenerateLink();
        setMagicLink(link);
        setLinkGenerated(true);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOpen, onGenerateLink]);

  // Email chips state
  const [emailChips, setEmailChips] = useState<string[]>([]);

  const addEmailsFromInput = (input: string) => {
    const parts = input
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@"));
    if (parts.length === 0) return;
    setEmailChips((prev) => {
      const set = new Set(prev);
      for (const p of parts) set.add(p);
      return Array.from(set);
    });
    setEmails("");
  };

  const handleEmailInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      addEmailsFromInput(emails);
    } else if (e.key === "Backspace" && emails === "" && emailChips.length > 0) {
      // remove last chip
      setEmailChips((prev) => prev.slice(0, -1));
    }
  };

  const removeChip = (email: string) => {
    setEmailChips((prev) => prev.filter((e) => e !== email));
  };

  const handleSendInvites = async () => {
    const emailList = emailChips;
    if (emailList.length === 0) return;

    setIsLoading(true);
    try {
      const result = await onSendInvites(emailList);
      
      // Check if we're in sandbox mode
      if (result && result.sandboxMode && result.magicLink) {
        // Show the magic link for manual sharing
        setMagicLink(result.magicLink);
        setLinkGenerated(true);
        alert(result.message + "\n\n" + result.instructions);
      } else {
        setEmails("");
        setEmailChips([]);
      }
    } catch (error) {
      console.error("Error sending invites:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Removed manual generate button – link is generated on open

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(magicLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error copying link:", error);
    }
  };

  const handleWhatsAppShare = () => {
    const message = `Te invito a colaborar en el cuestionario de formación de empresa. Accede aquí: ${magicLink}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  const handleEmailShare = () => {
    const subject = "Invitación a colaborar en cuestionario de formación de empresa";
    const body = `Hola,\n\nTe invito a colaborar en el cuestionario de formación de empresa. Puedes acceder aquí:\n\n${magicLink}\n\nSaludos`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div ref={containerRef} className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl p-6">
        {/* Close button */}
        <button
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl"
          onClick={onClose}
        >
          &times;
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6C4 4.89543 4.89543 4 6 4H8M16 4C16 2.89543 15.1046 2 14 2H10C8.89543 2 8 2.89543 8 4M16 4C16 5.10457 15.1046 6 14 6H10C8.89543 6 8 5.10457 8 4M8 4H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900">Compartir con socios</h3>
        </div>

        {/* Email Invites Section with chips */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Invitar por email
          </label>
          <div className="w-full p-2 border border-gray-300 rounded-lg flex flex-wrap gap-2">
            {emailChips.map((email) => (
              <span key={email} className="inline-flex items-center gap-2 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                {email}
                <button
                  type="button"
                  onClick={() => removeChip(email)}
                  className="hover:text-blue-900"
                  aria-label={`Eliminar ${email}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              className="flex-1 min-w-[160px] p-1 outline-none"
              placeholder="Escribe un email y presiona Enter..."
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              onKeyDown={handleEmailInputKeyDown}
            />
          </div>
          <button
            onClick={handleSendInvites}
            disabled={!emails.trim() || isLoading}
            className={clsx(
              "mt-3 w-full py-2 px-4 rounded-lg font-medium transition-colors",
              (emailChips.length > 0 || emails.trim()) && !isLoading
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            )}
          >
            {isLoading ? "Enviando..." : "Enviar invitaciones"}
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 my-6">
          <div className="relative -mt-3">
            <span className="bg-white px-3 text-sm text-gray-500">O</span>
          </div>
        </div>

        {/* Magic Link Section (pre-generated) */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enlace de colaboración
          </label>
          
          <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <input
                  type="text"
                  value={magicLink}
                  readOnly
                  className="flex-1 bg-transparent text-sm text-gray-700"
                />
                <button
                  onClick={handleCopyLink}
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Copiar enlace"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" fill="none"/>
                  </svg>
                </button>
              </div>
              
              {copied && (
                <p className="text-sm text-green-600 text-center">¡Enlace copiado!</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleWhatsAppShare}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                  </svg>
                  WhatsApp
                </button>
                
                <button
                  onClick={handleEmailShare}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" fill="none"/>
                  </svg>
                  Email
                </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}
