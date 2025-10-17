"use client";

import { useState } from "react";
import clsx from "clsx";
import ShareModal from "./ShareModal";
import { Session } from "next-auth";
import { handleShareWithAuth } from "@/lib/auth-helpers";

export type ProgressItem = {
  key: string;
  label: string; // keep UPPERCASE here for visual parity with the ref
  status: "todo" | "active" | "done";
};

interface ProgressSidebarProps {
  current: number;
  total: number;
  items: ProgressItem[];
  onGo?: (n: number) => void;
  onSendInvites?: (emails: string[]) => Promise<{
    success: boolean;
    message: string;
    sandboxMode?: boolean;
    magicLink?: string;
    instructions?: string;
  }>;
  onGenerateLink?: () => Promise<string>;
  session: Session | null;
  anonymousId: string;
  form?: any;
}

export default function ProgressSidebar({
  current,
  total,
  items,
  onGo,
  onSendInvites,
  onGenerateLink,
  session,
  anonymousId,
  form,
}: ProgressSidebarProps) {
  const [showShareModal, setShowShareModal] = useState(false);
  return (
    <aside className="w-[260px] shrink-0 sticky top-24 select-none">
      {/* Counter */}
      <div className="flex items-baseline gap-3">
        <div className="text-[104px] leading-none font-bold text-blue-600 tabular-nums">
          {String(current).padStart(2, "0")}
        </div>
        <div className="text-[32px] leading-none font-semibold text-gray-300">
          / {String(total).padStart(2, "0")}
        </div>
      </div>

      {/* Items */}
      <nav className="mt-6 space-y-6">
        {items.map((it, i) => {
          const clickable = onGo && (it.status === "done" || it.status === "active");

          return (
            <button
              key={it.key}
              type="button"
              onClick={() => clickable && onGo(i + 1)}
              className={clsx(
                "group flex items-center gap-3 w-full text-left",
                clickable ? "cursor-pointer" : "cursor-default"
              )}
            >
              {/* Dot / Check (smaller, like the ref) */}
              {it.status === "done" ? (
                <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-blue-600">
                  <svg
                    width="12"
                    height="9"
                    viewBox="0 0 12 9"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-white"
                  >
                    <path
                      d="M1 5l3 3L11 1"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              ) : it.status === "active" ? (
                <span className="relative">
                  {/* soft halo is subtle */}
                  <span className="absolute inset-0 rounded-full ring-[6px] ring-blue-100" />
                  <span className="relative block h-[22px] w-[22px] rounded-full bg-blue-600" />
                </span>
              ) : (
                <span className="block h-[22px] w-[22px] rounded-full bg-gray-300" />
              )}

              {/* Label (smaller, uppercase, tighter kerning like ref) */}
              <span
                className={clsx(
                  "text-[18px] tracking-tight uppercase",
                  it.status === "active"
                    ? "font-semibold text-gray-900"
                    : it.status === "done"
                    ? "text-gray-700"
                    : "text-gray-400"
                )}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Hint */}
      <p className="mt-8 text-[14px] leading-6 text-gray-500">
        Puedes guardar y continuar más tarde.
      </p>

      {/* Share Button */}
      <button
        onClick={() => {
          if (!session) {
            // Use our custom Auth0 signup URL
            handleShareWithAuth(session, anonymousId, form, () => setShowShareModal(true));
          } else {
            setShowShareModal(true);
          }
        }}
        className="mt-6 w-full flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6C4 4.89543 4.89543 4 6 4H8M16 4C16 2.89543 15.1046 2 14 2H10C8.89543 2 8 2.89543 8 4M16 4C16 5.10457 15.1046 6 14 6H10C8.89543 6 8 5.10457 8 4M8 4H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Compartir
      </button>

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onSendInvites={onSendInvites || (async () => ({ success: false, message: 'Not implemented' }))}
        onGenerateLink={onGenerateLink || (async () => window.location.href)}
      />
    </aside>
  );
}