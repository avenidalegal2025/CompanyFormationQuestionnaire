"use client";

import { useState } from 'react';

export default function HeroMiami2({
  title = "Crea una empresa en Estados Unidos",
}: {
  title?: string;
}) {
  const [videoError, setVideoError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Miami2 video loading error:', e);
    setVideoError(true);
    setVideoLoading(false);
  };

  const handleVideoLoad = () => {
    console.log('Miami2 video loaded successfully');
    setVideoError(false);
    setVideoLoading(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl h-64 sm:h-80">
      {!videoError ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition: 'center center',
            aspectRatio: '16/9'
          }}
          onLoadStart={() => {
            console.log('Miami2 video loading started');
            setVideoLoading(true);
          }}
          onLoadedData={handleVideoLoad}
          onCanPlay={handleVideoLoad}
          onPlay={() => console.log('Miami2 video playing')}
          onError={handleVideoError}
        >
          <source src="/hero-video-miami1.m4v?v=1" type="video/mp4" />
          <source src="/hero-video-miami1.m4v?v=1" type="video/quicktime" />
          Your browser does not support the video tag.
        </video>
      ) : (
        // Fallback background image when video fails
        <div 
          className="absolute inset-0 w-full h-full bg-cover bg-center"
          style={{
            backgroundImage: 'url(/miami.jpg)',
            objectPosition: 'center center',
            aspectRatio: '16/9'
          }}
        />
      )}
      
      {videoLoading && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="text-white text-sm">Cargando video...</div>
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
      <div className="relative px-6 py-10 sm:px-10 sm:py-14 h-full flex items-end">
        <h1 className="text-white text-2xl sm:text-3xl font-semibold tracking-tight">
          {title}
        </h1>
      </div>
    </div>
  );
}
