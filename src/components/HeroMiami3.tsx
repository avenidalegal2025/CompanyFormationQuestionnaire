"use client";

export default function HeroMiami3({
  title = "Crea una empresa en Estados Unidos",
}: {
  title?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl h-64 sm:h-80">
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
        onLoadStart={() => console.log('Miami3 video loading started')}
        onLoadedData={() => console.log('Miami3 video data loaded')}
        onCanPlay={() => console.log('Miami3 video can play')}
        onPlay={() => console.log('Miami3 video playing')}
        onError={(e) => console.log('Miami3 video error:', e)}
        onLoad={() => console.log('Miami3 video loaded')}
      >
        <source src="/hero-video-miami3.m4v?v=1" type="video/mp4" />
        <source src="/hero-video-miami3.m4v?v=1" type="video/quicktime" />
        Your browser does not support the video tag.
      </video>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
      <div className="relative px-6 py-10 sm:px-10 sm:py-14 h-full flex items-end">
        <h1 className="text-white text-2xl sm:text-3xl font-semibold tracking-tight">
          {title}
        </h1>
      </div>
    </div>
  );
}
