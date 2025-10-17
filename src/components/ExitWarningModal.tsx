"use client";

import { useEffect, useState } from "react";

interface ExitWarningModalProps {
  isOpen: boolean;
  onRegister: () => void;
  onExit: () => void;
}

export default function ExitWarningModal({ isOpen, onRegister, onExit }: ExitWarningModalProps) {
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Icon */}
          <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          
          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
            ¿Estás seguro?
          </h3>
          
          {/* Message */}
          <p className="text-gray-600 text-center mb-6">
            Si sales antes de registrarte perderás toda tu información.
          </p>
          
          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onExit}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Salir y perder datos
            </button>
            <button
              onClick={onRegister}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Registrarme
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
