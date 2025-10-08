"use client";

export default function HeroVideo({
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
        onLoadStart={() => console.log('Video loading started')}
        onLoadedData={() => console.log('Video data loaded')}
        onError={(e) => console.log('Video error:', e)}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
        <source src="/hero-video.mov" type="video/quicktime" />
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
