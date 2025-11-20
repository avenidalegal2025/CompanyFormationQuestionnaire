"use client";

import { useState, useRef, useEffect } from "react";

export default function InfoTooltip({ 
  title, 
  body, 
  linkUrl 
}: { 
  title: string; 
  body: string;
  linkUrl?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Parse body text to make "Lee nuestro artículo" clickable if linkUrl is provided
  const renderBody = () => {
    if (!linkUrl) {
      return <div className="mt-1 text-[13px] leading-5 text-gray-700 whitespace-pre-line">{body}</div>;
    }

    // Split body by "Lee nuestro artículo" and make it a link
    const parts = body.split(/(Lee nuestro artículo)/);
    
    return (
      <div className="mt-1 text-[13px] leading-5 text-gray-700 whitespace-pre-line">
        {parts.map((part, index) => {
          if (part === "Lee nuestro artículo") {
            return (
              <a
                key={index}
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800 cursor-pointer"
              >
                {part}
              </a>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="relative inline-block align-middle">
      <div 
        ref={triggerRef}
        className="group cursor-default"
        onMouseEnter={() => setIsOpen(true)}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
          i
        </span>
        {isOpen && (
          <div 
            ref={tooltipRef}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-20 w-72 rounded-xl border bg-white p-3 shadow-lg"
          >
            <div className="relative">
              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
                aria-label="Cerrar"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              
              <div className="text-sm font-semibold text-gray-900 pr-6">{title}</div>
              {renderBody()}
            </div>
        </div>
        )}
      </div>
    </div>
  );
}