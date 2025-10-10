"use client";

import Link from 'next/link';

export default function CheckoutCancel() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-yellow-600 text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago Cancelado</h1>
        <p className="text-gray-600 mb-6">
          Tu pago fue cancelado. No se han realizado cargos a tu cuenta.
        </p>
        
        <div className="space-y-3">
          <Link
            href="/"
            className="block w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700"
          >
            Intentar de Nuevo
          </Link>
          <Link
            href="/"
            className="block w-full bg-gray-200 text-gray-800 py-3 px-4 rounded-lg hover:bg-gray-300"
          >
            Regresar al Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
