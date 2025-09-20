"use client";

export default function InfoTooltip({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative inline-block align-middle">
      <div className="group cursor-default">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-600">i</span>
        <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition absolute left-full top-1/2 -translate-y-1/2 ml-3 z-20 w-72 rounded-xl border bg-white p-3 shadow-lg">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-[13px] leading-5 text-gray-700 whitespace-pre-line">{body}</div>
        </div>
      </div>
    </div>
  );
}