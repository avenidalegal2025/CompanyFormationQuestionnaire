"use client";

import clsx from "clsx";

export type ProgressItem = {
  key: string;
  label: string; // keep UPPERCASE here for visual parity with the ref
  status: "todo" | "active" | "done";
};

export default function ProgressSidebar({
  current,
  total,
  items,
  onGo,
}: {
  current: number;
  total: number;
  items: ProgressItem[];
  onGo?: (n: number) => void;
}) {
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
    </aside>
  );
}