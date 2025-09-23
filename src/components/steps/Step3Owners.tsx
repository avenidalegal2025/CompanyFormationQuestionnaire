"use client";

import { Controller, type UseFormReturn, type FieldPath } from "react-hook-form";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import SegmentedToggle from "@/components/SegmentedToggle";
import { type AllSteps } from "@/lib/schema";

type Props = {
  form: UseFormReturn<AllSteps>;
  setStep: (n: number) => void;
};

// Helper type + helper caster for dynamic field paths
type Owner = NonNullable<AllSteps["owners"]>[number];
const fp = (s: string) => s as unknown as FieldPath<AllSteps>;

export default function Step3Owners({ form, setStep }: Props) {
  const { control, register, watch, setValue, getValues } = form;

  // Safely read owners array (watch is fine here)
  const owners = (watch("owners") as Owner[] | undefined) ?? [];

  // Read ownersCount loosely and compute a safe final count
  const ownersCountRaw = getValues("ownersCount" as unknown as keyof AllSteps) as
    | number
    | undefined;

  const ownersCount =
    (typeof ownersCountRaw === "number" &&
    !Number.isNaN(ownersCountRaw) &&
    ownersCountRaw > 0
      ? ownersCountRaw
      : owners.length) || 1;

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Propietarios</h2>
        <p className="mt-1 text-sm text-gray-600">
          Indique los datos de cada propietario/accionista.
        </p>

        {/* Owners count (optional helper to quickly add/remove owner slots) */}
        <div className="mt-4">
          <label className="label">¿Cuántos propietarios?</label>
          <input
            className="input w-28"
            type="number"
            min={1}
            step={1}
            {...register("ownersCount" as unknown as keyof AllSteps, {
              valueAsNumber: true,
              onChange: (e) => {
                const next = Number(e.target.value || 1);
                const current = (getValues("owners") ?? []) as Owner[];

                if (next > current.length) {
                  const blanks: Owner[] = Array.from(
                    { length: next - current.length },
                    () => ({
                      fullName: "",
                      email: "",
                      phone: "",
                      ownership: undefined,
                      address: "",
                      isUsCitizen: "No",
                    })
                  );
                  setValue("owners", [...current, ...blanks], { shouldDirty: true });
                } else if (next < current.length) {
                  setValue("owners", current.slice(0, next), { shouldDirty: true });
                }
              },
            })}
            defaultValue={ownersCount}
          />
          <p className="help">Puede ajustar este número según sea necesario.</p>
        </div>

        {/* Owner blocks */}
        <div className="mt-6 space-y-6">
          {Array.from({ length: ownersCount }).map((_, idx) => {
            const n = idx + 1;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-gray-100 p-4 space-y-4 bg-white"
              >
                <h3 className="font-medium text-gray-900">Propietario {n}</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nombre completo</label>
                    <input
                      className="input"
                      {...register(`owners.${idx}.fullName` as const)}
                    />
                  </div>
                  <div>
                    <label className="label">Porcentaje de propiedad (%)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      {...register(`owners.${idx}.ownership` as const, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input
                      className="input"
                      type="email"
                      {...register(`owners.${idx}.email` as const)}
                    />
                  </div>
                  <div>
                    <label className="label">Teléfono</label>
                    <input
                      className="input"
                      type="tel"
                      {...register(`owners.${idx}.phone` as const)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Dirección</label>
                  <Controller
                    name={fp(`owners.${idx}.address`)}
                    control={control}
                    render={({ field }) => (
                      <AddressAutocomplete
                        placeholder="Escriba y seleccione la dirección"
                        defaultValue={(field.value as string) ?? ""}
                        onSelect={(addr) => {
                          const formatted =
                            addr.fullAddress ||
                            [addr.line1, addr.city, addr.state, addr.postalCode, addr.country]
                              .filter(Boolean)
                              .join(", ");
                          field.onChange(formatted);
                        }}
                      />
                    )}
                  />
                </div>

                <div className="max-w-sm">
                  <label className="label">¿Es ciudadano o residente de USA?</label>
                  <Controller
                    name={fp(`owners.${idx}.isUsCitizen`)}
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={(field.value as string) ?? "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Ciudadanía/Residencia USA"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-8 flex items-center justify-between">
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