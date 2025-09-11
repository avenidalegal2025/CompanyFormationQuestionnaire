import './globals.css'
import type { Metadata } from 'next'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Company Formation Questionnaire',
  description: 'Guided onboarding to collect details to open your company.',
}

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-100">
          <div className="flex items-center justify-between px-4 md:px-8 py-3">
            <Image
              src="/logo.png"
              alt="Avenida Legal"
              width={160}
              height={40}
              priority
              className="h-8 w-auto"
            />
          </div>
        </header>

        {/* Mobile progress (top bar) */}
        <div className="bg-white border-b border-gray-100 md:hidden">
          <div className="px-4 md:px-8 py-3">
            <nav
              id="progress-nav-mobile"
              className="flex items-center gap-3 overflow-x-auto whitespace-nowrap"
            />
          </div>
        </div>

        {/* App grid: wider sidebar so counter fits comfortably */}
        <div className="min-h-dvh grid grid-cols-1 md:grid-cols-[260px_auto]">
          {/* Sidebar (md and up) */}
          <aside className="bg-white border-r border-gray-100 p-6 hidden md:block">
            <nav className="space-y-2" id="progress-nav-desktop" />
            <p className="text-xs text-gray-500 mt-6">
              Puedes guardar y continuar más tarde.
            </p>
          </aside>

          {/* Main content */}
          <main className="px-4 md:px-8 py-6">
            <div className="max-w-3xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  )
}