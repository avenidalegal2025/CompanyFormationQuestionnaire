"use client"
import { ReactNode, useEffect } from "react"

export default function StepShell({
  title,
  description,
  stepIndex, // 0 = Empresa, 1 = Propietarios, 2 = Administrativos
  children,
}: {
  title: string
  description?: string
  stepIndex: number
  children: ReactNode
}) {
  useEffect(() => {
    const navDesktop = document.getElementById("progress-nav-desktop")
    const navMobile  = document.getElementById("progress-nav-mobile")

    // Sidebar sections (Crear cuenta is a static, completed pre-step)
    const sections = [
      { label: "Crear cuenta",              kind: "static" as const },
      { label: "Datos de la empresa",       kind: "wizard" as const, idx: 0 },
      { label: "Datos de los propietarios", kind: "wizard" as const, idx: 1 },
      { label: "Datos Administrativos",     kind: "wizard" as const, idx: 2 },
    ]
    const TOTAL   = sections.length                  // 4
    const CURRENT = Math.min(TOTAL, Math.max(1, stepIndex + 2)) // 1..4

    // ---------------- Desktop (md+): exact "04 / 08" composition ----------------
    if (navDesktop) {
      // Big current number; to its right, a narrow absolute box containing
      // the slash and the total on the SAME BASELINE (items-baseline).
      const numberHtml = `
        <div class="mb-6">
          <div class="flex items-end gap-1 tabular-nums">
            <div
              class="font-extrabold text-brand-600 leading-[0.83] tracking-tight
                     text-[92px] md:text-[112px]"
            >
              ${String(CURRENT).padStart(2, "0")}
            </div>

            <!-- Right column for slash + total, baseline-aligned -->
            <div class="relative h-[78px] md:h-[92px] w-[60px] md:w-[68px]">
              <div
                class="absolute left-0 top-[9%] md:top-[8%] flex items-baseline gap-[6px]"
              >
                <span class="text-gray-300 text-[22px] md:text-[26px] leading-none">/</span>
                <span class="text-gray-300 text-[22px] md:text-[26px] leading-none">${String(TOTAL).padStart(2, "0")}</span>
              </div>
            </div>
          </div>
        </div>
      `

      const listHtml = sections.map((s) => {
        const isStatic = s.kind === "static"
        const isActive = !isStatic && s.idx === stepIndex
        const isDone   = isStatic || (!isStatic && (s.idx as number) < stepIndex)

        const leftIcon = isDone
          ? `<span class="text-brand-600">✓</span>`
          : `<span class="h-2.5 w-2.5 rounded-full ${isActive ? "bg-brand-600" : "bg-gray-300"} inline-block"></span>`

        const labelCls = [
          "uppercase tracking-wide text-[11px]",
          isActive             ? "text-gray-900 font-semibold" : "",
          !isActive && isDone  ? "text-gray-700"               : "",
          !isActive && !isDone ? "text-gray-400"               : "",
        ].filter(Boolean).join(" ")

        return `
          <div class="flex items-center gap-3 py-2">
            ${leftIcon}
            <span class="${labelCls}">${s.label}</span>
          </div>
        `
      }).join("")

      navDesktop.innerHTML = numberHtml + listHtml
    }

    // ---------------- Mobile (< md): pills + compact counter ----------------
    if (navMobile) {
      const pillsHtml = sections.map((s) => {
        const isStatic = s.kind === "static"
        const isActive = !isStatic && s.idx === stepIndex
        const isDone   = isStatic || (!isStatic && (s.idx as number) < stepIndex)

        const base = "px-3 py-1.5 rounded-xl2 text-xs border transition-colors"
        const cls  = isActive
          ? "bg-brand-600 text-white border-brand-600"
          : isDone
            ? "bg-brand-50 text-brand-700 border-brand-100"
            : "bg-white text-gray-600 border-gray-200"

        const prefix = isStatic ? "✓" : String((s.idx as number) + 1)

        return `<span class="${base} ${cls}">
                  <span class="mr-1">${prefix}.</span>${s.label}
                </span>`
      }).join("")

      const counterHtml = `
        <span class="ml-auto text-xs text-gray-400 tabular-nums">
          Paso ${String(CURRENT).padStart(2, "0")} / ${String(TOTAL).padStart(2, "0")}
        </span>
      `
      navMobile.innerHTML = `<div class="flex items-center gap-2 w-full">${pillsHtml}${counterHtml}</div>`
    }
  }, [stepIndex])

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="text-gray-600 mt-1">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  )
}