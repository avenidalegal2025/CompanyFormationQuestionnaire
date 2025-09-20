"use client";

import { Controller, useFieldArray, type UseFormReturn } from "react-hook-form";
import SegmentedToggle from "@/components/SegmentedToggle";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import HeroBanner from "@/components/HeroBanner";
import { type AllSteps } from "@/lib/schema";

type Props = {
  form: UseFormReturn<AllSteps>;
  setStep: (n: number) => void;
};

export default function Step3Owners({ form, setStep }: Props) {
  const { control, register, watch, setValue } = form;

  // owners array control
  const ownersArray = useFieldArray({
    control,
    name: "owners",
  });

  // helpers
  const entityType = watch("company.entityType");
  const ownerPlural = entityType === "C-Corp" ? "accionistas" : "socios";
  const ownerSingular = entityType === "C-Corp" ? "Accionista" : "Socio";

  // SSN formatter
  const formatSSN = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 9);
    const a = d.slice(0, 3);
    const b = d.slice(3, 5);
    const c = d.slice(5, 9);
    if (d.length <= 3) return a;
    if (d.length <= 5) return `${a}-${b}`;
    return `${a}-${b}-${c}`;
  };

  // number-of-owners input (1–6)
  const ownersCount = ownersArray.fields.length;
  const setCount = (n: number) => {
    const next = Math.max(1, Math.min(6, Math.floor(n)));
    const curr = ownersArray.fields.length;
    if (next > curr) {
      for (let i = curr; i < next; i++) {
        ownersArray.append({
          fullName: "",
          addressFull: "",
          ownership: undefined,
          isUsResident: "No",
          ssn: "",
          passportFileName: "",
        } as any);
      }
    } else if (next < curr) {
      for (let i = curr - 1; i >= next; i--) ownersArray.remove(i);
    }
  };

  // percentage sum
  const percentSum = (watch("owners") || [])
    .map((o: any) => Number(o?.ownership || 0))
    .reduce((a: number, b: number) => a + (isFinite(b) ? b : 0), 0);

  return (
    <section className="space-y-6">
      <HeroBanner title={`Datos de los ${ownerPlural}`} />

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">{`Datos de los ${ownerPlural}`}</h2>
        <p className="mt-1 text-sm text-gray-600">
          Indique el número de {ownerPlural} y complete sus datos.
        </p>

        {/* owners count */}
        <div className="mt-6">
          <label className="label">{`Número de ${ownerPlural}`}</label>
          <input
            className="input w-48"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={ownersCount}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              if (!digits) return;
              setCount(Number(digits));
            }}
            onBlur={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setCount(digits ? Number(digits) : ownersCount || 1);
            }}
            placeholder="1–6"
          />
          <p className="help">Define cuántos bloques se muestran debajo (1 a 6).</p>
        </div>

        {/* owner blocks */}
        <div className="mt-6 space-y-6">
          {ownersArray.fields.map((field, idx) => {
            const resident = watch(`owners.${idx}.isUsResident` as const);
            return (
              <div key={field.id} className="rounded-2xl border border-gray-100 p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">
                  {ownerSingular} {idx + 1}
                </div>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-9">
                    <label className="label">Nombre completo</label>
                    <input className="input" {...register(`owners.${idx}.fullName` as const)} />
                  </div>

                  <div className="col-span-12 md:col-span-3">
                    <label className="label">Porcentaje</label>
                    <input
                      className="input w-24"
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      {...register(`owners.${idx}.ownership` as const, { valueAsNumber: true })}
                    />
                  </div>

                  <div className="col-span-12">
                    <label className="label">Dirección completa</label>
                    <Controller
                      name={`owners.${idx}.addressFull` as const}
                      control={control}
                      render={({ field }) => (
                        <AddressAutocomplete
                          placeholder="Escriba y seleccione la dirección"
                          onSelect={(addr) => {
                            const formatted =
                              addr.fullAddress ||
                              [addr.line1, addr.city, addr.state, addr.postalCode, addr.country]
                                .filter(Boolean)
                                .join(", ");
                            field.onChange(formatted);
                          }}
                          defaultValue={field.value ?? ""}
                          onSelectText // (no-op, just to avoid TS complaints)
                        />
                      )}
                    />
                  </div>

                  {/* Residency + SSN/Passport */}
                  <div className="col-span-12">
                    <div className="mb-2">
                      <div className="label">
                        {entityType === "C-Corp"
                          ? "¿El accionista es residente de los Estados Unidos?"
                          : "¿El socio es residente de los Estados Unidos?"}
                      </div>
                    </div>
                    <Controller
                      name={`owners.${idx}.isUsResident` as const}
                      control={control}
                      render={({ field }) => (
                        <SegmentedToggle
                          value={(field.value as any) || "No"}
                          onChange={field.onChange}
                          options={[
                            { value: "Yes", label: "Sí" },
                            { value: "No", label: "No" },
                          ]}
                          ariaLabel="Residencia en EE.UU."
                          name={field.name}
                        />
                      )}
                    />
                  </div>

                  {resident === "Yes" && (
                    <div className="col-span-12 md:col-span-6">
                      <label className="label">SSN / ITIN</label>
                      <Controller
                        name={`owners.${idx}.ssn` as const}
                        control={control}
                        render={({ field }) => (
                          <input
                            className="input"
                            inputMode="numeric"
                            placeholder="123-45-6789"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(formatSSN(e.target.value))}
                          />
                        )}
                      />
                      <p className="help">Formato automático: 123-45-6789</p>
                    </div>
                  )}

                  {resident === "No" && (
                    <div className="col-span-12">
                      <label className="label">
                        Subir imagen de pasaporte vigente (.png o .jpeg)
                      </label>
                      <div className="border-2 border-dashed rounded-xl p-6 text-center">
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          id={`passport-file-${idx}`}
                          {...register(`owners.${idx}.passportFile` as const, {
                            onChange: (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              setValue(
                                `owners.${idx}.passportFileName` as const,
                                file?.name || "",
                                { shouldDirty: true }
                              );
                            },
                          })}
                        />
                        <label
                          htmlFor={`passport-file-${idx}`}
                          className="cursor-pointer inline-block px-4 py-2 rounded-xl border text-sm"
                        >
                          Arrastrar y soltar o <span className="underline">buscar archivo</span>
                        </label>
                        <div className="mt-3 text-sm text-gray-600">
                          {(watch(`owners.${idx}.passportFileName` as const) as string)
                            ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-green-600">●</span>
                                {watch(`owners.${idx}.passportFileName` as const) as string}
                              </span>
                            )
                            : "Sin archivo seleccionado"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* sum */}
        <div className="mt-4 mb-6 text-sm text-gray-700">
          Suma de porcentajes:{" "}
          <span
            className={
              percentSum === 100
                ? "font-semibold text-brand-600"
                : "font-semibold text-red-600"
            }
          >
            {percentSum.toFixed(2)}%
          </span>{" "}
          (debe ser 100%)
        </div>

        {/* footer */}
        <div className="mt-6 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(2)}>
            Atrás
          </button>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-sm text-gray-700 hover:underline"
              onClick={() => alert("Se guardará como borrador…")}
            >
              Guardar y continuar más tarde
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>
              Continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}