"use client";

import Image from "next/image";

export default function Hero() {
  return (
    <section className="container my-6">
      <div className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0">
          <Image
            src="/miami.jpg"
            alt="Miami skyline"
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
        </div>
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <h1 className="text-white text-2xl sm:text-3xl font-semibold tracking-tight">
            Crea una empresa en Estados Unidos
          </h1>
        </div>
      </div>
    </section>
  );
}