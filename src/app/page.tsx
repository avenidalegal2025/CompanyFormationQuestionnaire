"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import StepShell from "@/components/StepShell"
import SegmentedToggle from "@/components/SegmentedToggle"
import AddressAutocomplete from "@/components/AddressAutocomplete"
import { AllStepsSchema, type AllSteps } from "@/lib/schema"

// Orden solicitado
const formationStates = [
  "Florida",
  "Delaware",
  "Wyoming",
  "Texas",
  "Nevada",
  "New Mexico",
  "Georgia",
  "California",
  "Arizona",
]

const entityTypes = ["LLC", "C-Corp"]

export default function Home() {
  // Mostramos la sección 2 (Datos de la empresa)
  const [step] = useState(2)

  const form = useForm<AllSteps>({
    resolver: zodResolver(AllStepsSchema),
    defaultValues: {
      company: {
        formationState: "Florida",
        entityType: "LLC",
        companyNameBase: "",
        companyName: "",
        hasUsaAddress: "No",
        hasUsPhone: "No",
        country: "Estados Unidos de América",
        businessPurpose: "",
        usPhoneNumber: "",
      } as any,
      owners: [{ fullName: "", email: "", phone: "", ownership: 100 }],
      banking: { needBankAccount: "Yes" },
      attachments: {},
    },
    mode: "onChange",
  })

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    getValues,
  } = form

  // ====== Nombre con sufijo dinámico (LLC/INC) ======
  const entityType = watch("company.entityType")
  const companyNameBase = (watch("company.companyNameBase") || "").toUpperCase()
  const suffixWord = entityType === "C-Corp" ? "INC" : "LLC"

  useEffect(() => {
    const base = companyNameBase.replace(/\s+(LLC|INC)\.?$/i, "").trim()
    const full = base ? `${base} ${suffixWord}` : ""
    setValue("company.companyName", full, { shouldValidate: true })
  }, [entityType, companyNameBase, suffixWord, setValue])

  // Posición del sufijo exactamente después de lo tipeado
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [suffixLeftPx, setSuffixLeftPx] = useState(0)

  function computeSuffixLeft() {
    const input = inputRef.current
    if (!input) return
    const cs = getComputedStyle(input)
    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement("canvas"))
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const font =
      cs.font && cs.font !== "inherit"
        ? cs.font
        : `${cs.fontStyle || ""} ${cs.fontVariant || ""} ${cs.fontWeight || ""} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`
    ctx.font = font

    const base = companyNameBase.replace(/\s+(LLC|INC)\.?$/i, "")
    let width = ctx.measureText(base).width
    const ls = parseFloat(cs.letterSpacing || "0")
    if (!Number.isNaN(ls) && ls !== 0) width += ls * Math.max(0, base.length - 1)

    const padLeft = parseFloat(cs.paddingLeft || "0") + parseFloat(cs.borderLeftWidth || "0")
    const gap = 4
    setSuffixLeftPx(padLeft + width + gap)
  }
  useEffect(() => {
    computeSuffixLeft()
    const onResize = () => computeSuffixLeft()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    computeSuffixLeft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyNameBase, entityType])

  // ====== Toggles ======
  const hasUsaAddress = watch("company.hasUsaAddress")
  const hasUsPhone = watch("company.hasUsPhone")

  // ====== Phone formatting: +1 305 555 0123 ======
  const phoneRef = useRef<HTMLInputElement | null>(null)
  const PHONE_PREFIX = "+1 " // bloqueado

  const formatUsPhone = (rawDigits: string) => {
    // rawDigits = solo dígitos (sin el “1” inicial del prefijo)
    const d = rawDigits.slice(0, 10) // 10 dígitos tras el +1
    const a = d.slice(0, 3)
    const b = d.slice(3, 6)
    const c = d.slice(6, 10)
    if (d.length <= 3) return `${PHONE_PREFIX}${a}`
    if (d.length <= 6) return `${PHONE_PREFIX}${a} ${b}`
    return `${PHONE_PREFIX}${a} ${b} ${c}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    let v = el.value

    // Quita todo menos dígitos
    const digits = v.replace(/[^\d]/g, "")

    // Siempre forzamos el prefijo +1 (lo ignoramos en el conteo de 10)
    let rest = digits
    if (rest.startsWith("1")) rest = rest.slice(1)

    const formatted = formatUsPhone(rest)
    setValue("company.usPhoneNumber", formatted, { shouldDirty: true, shouldValidate: true })

    // Ajuste de cursor para evitar que se meta antes del prefijo
    requestAnimationFrame(() => {
      const node = phoneRef.current
      if (!node) return
      const pos = Math.max(node.selectionStart ?? formatted.length, PHONE_PREFIX.length)
      node.setSelectionRange(pos, pos)
    })
  }

  const preventDeletePrefix = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    // Bloquea Backspace/Delete si toca el prefijo
    if ((e.key === "Backspace" && start <= PHONE_PREFIX.length && end <= PHONE_PREFIX.length) ||
        (e.key === "Delete" && start < PHONE_PREFIX.length)) {
      e.preventDefault()
    }
  }

  // ====== Submit (placeholder) ======
  const onSubmit = (_data: AllSteps) => alert("Guardado (UI). La integración final se hace luego.")

  return (
    <>

      <section className="container my-6">
        <div className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-0">
            <Image src="/miami.jpg" alt="Miami skyline" fill priority className="object-cover" sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
          </div>
          <div className="relative px-6 py-10 sm:px-10 sm:py-14">
            <h1 className="text-white text-2xl sm:text-3xl font-semibold tracking-tight">
              Crea una empresa en Estados Unidos
            </h1>
          </div>
        </div>
      </section>

      {/* SOLO contenido (el sidebar lo manejas fuera, no lo duplicamos aquí) */}
      <main className="container pb-16">
        <section className="card">
          <form onSubmit={handleSubmit(onSubmit)}>
            <StepShell title="Datos de la empresa" description="Cuéntanos sobre la nueva empresa" stepIndex={step}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Estado */}
                <div className="md:col-span-1">
                  <div className="mb-2"><div className="label-lg">Estado donde desea formar su empresa</div></div>
                  <select className="input" {...register("company.formationState", { required: true })}>
                    {formationStates.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <p className="help">{errors.company?.formationState?.message as any}</p>
                </div>

                {/* Tipo de entidad */}
                <div className="md:col-span-1">
                  <div className="mb-2"><div className="label-lg">Tipo de entidad</div></div>
                  <Controller
                    name="company.entityType"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value}
                        onChange={field.onChange}
                        options={entityTypes.map((v) => ({ value: v, label: v }))}
                        ariaLabel="Tipo de entidad"
                        name={field.name}
                      />
                    )}
                  />
                </div>

                {/* Nombre con sufijo dinámico */}
                <div className="md:col-span-2">
                  <div className="mb-2"><div className="label-lg">Nombre de la empresa</div></div>
                  <Controller
                    name="company.companyNameBase"
                    control={control}
                    render={({ field }) => (
                      <div className="relative">
                        <input
                          ref={(el) => {
                            field.ref(el)
                            inputRef.current = el as HTMLInputElement
                          }}
                          value={(field.value || "").toUpperCase()}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          className="input uppercase"
                        />
                        <span
                          className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 select-none"
                          style={{ left: `${suffixLeftPx}px` }}
                        >
                          {field.value ? ` ${suffixWord}` : ""}
                        </span>
                      </div>
                    )}
                  />
                  <input type="hidden" {...register("company.companyName")} />
                  <p className="help">{errors.company?.companyName?.message as any}</p>
                </div>

                {/* Dirección en USA */}
                <div className="md:col-span-2">
                  <div className="mb-2">
                    <div className="label-lg">¿Cuenta con una dirección en USA para su empresa?</div>
                    <div className="text-gray-600 text-[15px] mt-1">
                      No puede ser P.O. BOX. Si no cuenta con una nosotros le podemos proveer una por $600 USD al año.
                    </div>
                  </div>
                  <Controller
                    name="company.hasUsaAddress"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v)
                          if (v === "Yes") {
                            setValue("company.country", "Estados Unidos de América", { shouldDirty: true })
                            setValue("company.state", getValues("company.formationState"), { shouldDirty: true })
                          }
                        }}
                        options={[{ value: "Yes", label: "Sí" }, { value: "No", label: "No" }]}
                        ariaLabel="Cuenta con dirección en USA"
                        name={field.name}
                      />
                    )}
                  />
                </div>

                {hasUsaAddress === "Yes" && (
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Autocomplete */}
                    <div className="md:col-span-2">
                      <div className="mb-2">
                        <div className="label-lg">Dirección (autocompletar)</div>
                        <div className="text-gray-600 text-[15px] mt-1">
                          Escribe y selecciona la dirección exacta en Estados Unidos.
                        </div>
                      </div>
                      <AddressAutocomplete
                        country="us"
                        placeholder="1600 Pennsylvania Ave NW, Washington"
                        onSelect={(addr) => {
                          setValue("company.addressLine1", addr.line1, { shouldDirty: true, shouldValidate: true })
                          setValue("company.addressLine2", "", { shouldDirty: true })
                          setValue("company.city", addr.city, { shouldDirty: true, shouldValidate: true })
                          setValue("company.state", addr.state, { shouldDirty: true, shouldValidate: true })
                          setValue("company.postalCode", addr.postalCode, { shouldDirty: true, shouldValidate: true })
                          setValue("company.country", "Estados Unidos de América", { shouldDirty: true, shouldValidate: true })
                        }}
                      />
                    </div>

                    <div>
                      <label className="label">Dirección línea 1</label>
                      <input className="input" {...register("company.addressLine1")} />
                    </div>
                    <div>
                      <label className="label">Dirección línea 2</label>
                      <input className="input" {...register("company.addressLine2")} />
                    </div>
                    <div>
                      <label className="label">Ciudad</label>
                      <input className="input" {...register("company.city")} />
                    </div>
                    <div>
                      <label className="label">Estado/Provincia</label>
                      <input className="input" {...register("company.state")} />
                    </div>
                    <div>
                      <label className="label">Código postal</label>
                      <input className="input" {...register("company.postalCode")} />
                    </div>
                    <div>
                      <label className="label">País</label>
                      <input className="input" value="Estados Unidos de América" readOnly />
                    </div>
                  </div>
                )}

                {/* Teléfono USA */}
                <div className="md:col-span-2">
                  <div className="mb-2">
                    <div className="label-lg">¿Cuenta con número de teléfono de USA de su empresa?</div>
                    <div className="text-gray-600 text-[15px] mt-1">
                      Si no cuenta con uno, nosotros se lo podemos proveer por $180 USD al año.
                    </div>
                  </div>
                  <Controller
                    name="company.hasUsPhone"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value}
                        onChange={field.onChange}
                        options={[{ value: "Yes", label: "Sí" }, { value: "No", label: "No" }]}
                        ariaLabel="Cuenta con número de teléfono USA"
                        name={field.name}
                      />
                    )}
                  />
                </div>

                {hasUsPhone === "Yes" && (
                  <div className="md:col-span-2">
                    <label className="label">Número de teléfono (USA)</label>
                    <input
                      ref={(el) => (phoneRef.current = el)}
                      className="input"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={watch("company.usPhoneNumber") || "+1 "}
                      onChange={handlePhoneChange}
                      onKeyDown={preventDeletePrefix}
                    />
                    <p className="help">Formato: +1 305 555 0123</p>
                  </div>
                )}

                {/* Fin / objeto social */}
                <div className="md:col-span-2">
                  <div className="mb-2">
                    <div className="label-lg">Describir el fin de la empresa</div>
                    <div className="text-gray-600 text-[15px] mt-1">Describir qué va a hacer, vender, etc.</div>
                  </div>
                  <textarea className="input min-h-32" {...register("company.businessPurpose")} />
                </div>
              </div>

              <div className="mt-6">
                <button type="submit" className="btn btn-primary">Guardar</button>
              </div>
            </StepShell>
          </form>
        </section>
      </main>
    </>
  )
}