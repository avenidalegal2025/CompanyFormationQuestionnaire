'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

interface Screenshot {
  key: string;
  name: string;
  url: string;
  size: number;
  lastModified: string;
}

interface ScreenshotData {
  company: string;
  folder: string;
  count: number;
  screenshots: Screenshot[];
}

function ScreenshotViewer() {
  const searchParams = useSearchParams();
  const company = searchParams.get('company');
  
  const [data, setData] = useState<ScreenshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<Screenshot | null>(null);

  useEffect(() => {
    if (!company) {
      setError('No company specified');
      setLoading(false);
      return;
    }

    fetch(`/api/admin/screenshots?company=${encodeURIComponent(company)}`)
      .then(async res => {
        if (!res.ok) {
          if (res.status === 403) {
            const data = await res.json();
            throw new Error(`No autorizado (${data.email || 'no email'}) - solo abogados de Avenida Legal`);
          }
          throw new Error('Error al cargar las capturas');
        }
        return res.json();
      })
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [company]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando capturas de pantalla...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">❌ Error</h1>
          <p className="text-gray-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.count === 0) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-yellow-400 mb-4">📭 Sin Capturas</h1>
          <p className="text-gray-300">
            No se encontraron capturas de pantalla para <strong>{company}</strong>.
          </p>
          <p className="text-gray-400 mt-2 text-sm">
            Las capturas se generan después de que el sistema complete el auto-filing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{data.company}</h1>
              <p className="text-gray-400 text-sm">
                {data.count} captura{data.count !== 1 ? 's' : ''} del proceso de Sunbiz
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="https://airtable.com/app8Ggz2miYds1F38"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                ← Volver a Airtable
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Screenshot Grid */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.screenshots.map((screenshot, index) => (
            <div
              key={screenshot.key}
              className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 transition cursor-pointer"
              onClick={() => setSelectedImage(screenshot)}
            >
              <div className="aspect-video relative bg-gray-900">
                <img
                  src={screenshot.url}
                  alt={screenshot.name}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
                <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono">
                  {index + 1}/{data.count}
                </div>
              </div>
              <div className="p-3">
                <p className="text-gray-300 text-sm font-medium truncate">{screenshot.name}</p>
                <p className="text-gray-500 text-xs">
                  Click para ampliar
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-full max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 text-xl font-bold"
            >
              ✕ Cerrar
            </button>
            <img
              src={selectedImage.url}
              alt={selectedImage.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-center text-gray-400 mt-4">{selectedImage.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScreenshotsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    }>
      <ScreenshotViewer />
    </Suspense>
  );
}

