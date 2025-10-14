"use client";

import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4">
              ¡Bienvenido a Avenida Legal!
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Tu empresa está siendo procesada. Accede a tu hub empresarial para gestionar todos tus documentos.
            </p>
          </div>

          {/* Status Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-green-600 text-4xl mb-4">✅</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Pago Confirmado</h3>
              <p className="text-gray-600">Tu pago ha sido procesado exitosamente</p>
            </div>
            
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-blue-600 text-4xl mb-4">📋</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Documentos en Proceso</h3>
              <p className="text-gray-600">Preparando tu documentación empresarial</p>
            </div>
            
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-purple-600 text-4xl mb-4">🚀</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Listo en 5-7 días</h3>
              <p className="text-gray-600">Recibirás todo en tu correo electrónico</p>
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">¿Qué sigue?</h2>
            <div className="grid md:grid-cols-2 gap-6 text-left">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">1. Accede a tu Hub</h3>
                <p className="text-gray-600 mb-4">
                  Inicia sesión para acceder a tu hub empresarial donde podrás ver el progreso de tu empresa y gestionar todos tus documentos.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">2. Servicios Adicionales</h3>
                <p className="text-gray-600 mb-4">
                  Descubre servicios complementarios como marcas registradas, dominios, logos y más para hacer crecer tu negocio.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            <Link
              href="/client"
              className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Ir a Mi Hub Empresarial
            </Link>
            <div className="text-sm text-gray-500">
              <p>¿Necesitas ayuda? <a href="mailto:support@avenidalegal.com" className="text-blue-600 hover:underline">Contáctanos</a></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
