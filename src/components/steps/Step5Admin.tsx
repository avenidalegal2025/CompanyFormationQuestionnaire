// src/components/steps/Step5Admin.tsx
"use client";

import { useEffect } from "react";
import { Controller, type FieldPath } from "react-hook-form";
import HeroMiami1 from "@/components/HeroMiami1";
import SegmentedToggle from "@/components/SegmentedToggle";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import InfoTooltip from "@/components/InfoTooltip";
import type { AllSteps } from "@/lib/schema";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

// helper for dynamic field paths
const fp = (s: string) => s as unknown as FieldPath<AllSteps>;

interface Step5AdminProps extends StepProps {
  session: Session | null;
  anonymousId: string;
}

export default function Step5Admin({ form, setStep, onSave, onNext, session, anonymousId }: Step5AdminProps) {
  const { control, register, watch, setValue } = form;

  const entityType = watch("company.entityType");

  // C-Corp: directors & officers
  const directorsAllOwners = watch("admin.directorsAllOwners");
  const directorsCount = watch("admin.directorsCount") || 1;

  const officersAllOwners = watch("admin.officersAllOwners");
  const officersCount = watch("admin.officersCount") || 1;

  // LLC: managers
  const managersAllOwners = watch("admin.managersAllOwners");
  const managersCountRaw = watch("admin.managersCount");
  // Only use valid numbers > 0, otherwise treat as empty/undefined
  const managersCount = (typeof managersCountRaw === 'number' && managersCountRaw > 0 && !isNaN(managersCountRaw)) 
    ? managersCountRaw 
    : undefined;

  // Track selected officer roles to prevent duplicates
  const selectedRoles = Array.from({ length: officersCount || 0 }).map((_, idx) => 
    watch(`admin.officer${idx + 1}Role`) as string
  ).filter(role => role && role !== "");

  const availableRoles = ["President", "Vice-President", "Treasurer", "Secretary"];

  // Validation function to check if at least one president is selected (C‑Corp/S-Corp only)
  const validateOfficers = () => {
    if (entityType !== "C-Corp" && entityType !== "S-Corp") {
      return true;
    }
    if (officersAllOwners === "Yes") {
      // Check if at least one shareholder has the President role
      const hasPresident = Array.from({ length: watch("ownersCount") || 1 }).some((_, idx) => {
        const role = watch(fp(`admin.shareholderOfficer${idx + 1}Role`)) as string;
        return role === "President";
      });
      
      if (!hasPresident) {
        alert("Al menos uno de los accionistas debe ser presidente para continuar.");
        return false;
      }
    } else if (officersAllOwners === "No") {
      // Ensure officersCount is at least 1
      const currentOfficersCount = watch("admin.officersCount") || 1;
      if (currentOfficersCount < 1) {
        alert("Debe haber al menos un oficial.");
        return false;
      }
      
      // Check if at least one officer has the President role
      const hasPresident = Array.from({ length: currentOfficersCount }).some((_, idx) => {
        const role = watch(fp(`admin.officer${idx + 1}Role`)) as string;
        return role === "President";
      });
      
      if (!hasPresident) {
        alert("Al menos uno de los oficiales debe ser presidente para continuar.");
        return false;
      }

      // Require SSN for the President when officers are not the owners
      const presidentHasSSN = Array.from({ length: currentOfficersCount }).some((_, idx) => {
        const role = watch(fp(`admin.officer${idx + 1}Role`)) as string;
        const ssn = watch(fp(`admin.officer${idx + 1}SSN`)) as string;
        return role === "President" && ssn && ssn.trim() !== "";
      });

      if (!presidentHasSSN) {
        alert("El oficial con rol de Presidente debe incluir su SSN.");
        return false;
      }
    }
    return true;
  };

  // Validation function to check managers (LLC only)
  const validateManagers = () => {
    if (entityType !== "LLC") {
      return true;
    }
    
    // Read the current value directly (not from the variable which might be stale)
    const currentManagersAllOwners = watch("admin.managersAllOwners");
    
    // If all owners are managers, ensure managersCount is set and managers are populated
    if (currentManagersAllOwners === "Yes") {
      const ownersCount = watch("ownersCount") || 1;
      const currentManagersCount = watch("admin.managersCount");
      
      // Ensure managersCount is set to match ownersCount
      if (currentManagersCount !== ownersCount) {
        setValue("admin.managersCount", ownersCount, { shouldValidate: false });
      }
      
      // Verify all managers have names (they should be auto-populated from owners when "Yes")
      const missingManagers = Array.from({ length: Math.min(ownersCount, 6) }).some((_, idx) => {
        // Check for new firstName/lastName fields OR legacy fullName field
        const managerFirstName = watch(fp(`admin.manager${idx + 1}FirstName`)) as string;
        const managerLastName = watch(fp(`admin.manager${idx + 1}LastName`)) as string;
        const managerName = watch(fp(`admin.manager${idx + 1}Name`)) as string;
        const ownerFirstName = watch(fp(`owners.${idx}.firstName`)) as string;
        const ownerLastName = watch(fp(`owners.${idx}.lastName`)) as string;
        const ownerName = watch(fp(`owners.${idx}.fullName`)) as string;
        
        // Check if manager has either firstName/lastName OR legacy Name
        const hasManagerName = (managerFirstName && managerFirstName.trim()) || 
                               (managerLastName && managerLastName.trim()) || 
                               (managerName && managerName.trim());
        
        // If manager name is missing but owner name exists, populate it now
        if (!hasManagerName) {
          if (ownerFirstName) {
            setValue(fp(`admin.manager${idx + 1}FirstName`), ownerFirstName, { shouldValidate: false });
          }
          if (ownerLastName) {
            setValue(fp(`admin.manager${idx + 1}LastName`), ownerLastName, { shouldValidate: false });
          }
          if (ownerName && !ownerFirstName && !ownerLastName) {
            setValue(fp(`admin.manager${idx + 1}Name`), ownerName, { shouldValidate: false });
          }
        }
        
        return !hasManagerName && !ownerFirstName && !ownerLastName && !ownerName;
      });
      
      if (missingManagers) {
        alert("Por favor complete el nombre de todos los socios antes de continuar.");
        return false;
      }
      
      return true; // All owners are managers, validation passed
    }
    
    // If not all owners are managers, check if managersCount is valid
    // Read managersCount directly from form state
    const currentManagersCount = watch("admin.managersCount");
    if (!currentManagersCount || currentManagersCount < 1 || currentManagersCount > 6) {
      alert("Por favor ingrese un número válido de gerentes (entre 1 y 6).");
      return false;
    }
    
    // Check if all managers have names filled (using new firstName/lastName fields)
    const missingManagers = Array.from({ length: currentManagersCount }).some((_, idx) => {
      const managerFirstName = watch(fp(`admin.manager${idx + 1}FirstName`)) as string;
      const managerLastName = watch(fp(`admin.manager${idx + 1}LastName`)) as string;
      const managerName = watch(fp(`admin.manager${idx + 1}Name`)) as string;
      
      // Check if manager has either firstName/lastName OR legacy Name
      const hasManagerName = (managerFirstName && managerFirstName.trim()) || 
                             (managerLastName && managerLastName.trim()) || 
                             (managerName && managerName.trim());
      return !hasManagerName;
    });
    
    if (missingManagers) {
      alert("Por favor complete el nombre de todos los gerentes antes de continuar.");
      return false;
    }
    
    return true;
  };

  // Note: When officersAllOwners is "Yes", user must manually select which owner is President
  // We don't auto-assign it - the user needs to make the choice

  // Auto-assign and lock President role when there's only 1 officer
  useEffect(() => {
    if ((entityType === "C-Corp" || entityType === "S-Corp") && officersAllOwners === "No" && officersCount === 1) {
      const currentRole = watch(fp("admin.officer1Role")) as string;
      if (currentRole !== "President") {
        setValue(fp("admin.officer1Role"), "President");
      }
    }
  }, [entityType, officersAllOwners, officersCount, watch, setValue]);

  // Auto-populate managers from owners when "Todos los socios son gerentes" is Yes
  // This happens in the background - no input fields are shown
  useEffect(() => {
    if (entityType === "LLC") {
      const currentManagersAllOwners = watch("admin.managersAllOwners");
      // Default to "Yes" if not set
      const isAllOwnersManagers = currentManagersAllOwners === "Yes" || currentManagersAllOwners === undefined;
      
      if (isAllOwnersManagers) {
        // If undefined, set it to "Yes"
        if (currentManagersAllOwners === undefined) {
          setValue("admin.managersAllOwners", "Yes", { shouldValidate: false });
        }
        
        const ownersCount = watch("ownersCount") || 1;
        const currentManagersCount = watch("admin.managersCount");
        
        // Set managers count to match owners count if not already set
        if (currentManagersCount !== ownersCount) {
          setValue("admin.managersCount", ownersCount, { shouldValidate: false });
        }
        
        // Auto-populate each manager's name and address from corresponding owner (in background)
        Array.from({ length: Math.min(ownersCount, 6) }).forEach((_, idx) => {
          const ownerName = watch(fp(`owners.${idx}.fullName`)) as string;
          const ownerAddress = watch(fp(`owners.${idx}.address`)) as string;
          const ownerCity = watch(fp(`owners.${idx}.city`)) as string;
          const ownerState = watch(fp(`owners.${idx}.state`)) as string;
          const ownerZipCode = watch(fp(`owners.${idx}.zipCode`)) as string;
          
          // Set manager name from owner name (always update, even if empty)
          setValue(fp(`admin.manager${idx + 1}Name`), ownerName || "", { shouldValidate: false });
          
          // Set manager address from owner address (always update, even if empty)
          // Use full address if available, otherwise construct from components
          const fullOwnerAddress = ownerAddress || 
            (ownerCity || ownerState || ownerZipCode 
              ? [ownerAddress, ownerCity, ownerState, ownerZipCode].filter(Boolean).join(", ")
              : "");
          setValue(fp(`admin.manager${idx + 1}Address`), fullOwnerAddress, { shouldValidate: false });
        });
      }
    }
  }, [
    entityType, 
    managersAllOwners, 
    watch("ownersCount"),
    watch("admin.managersAllOwners"),
    // Watch all owner fields to update managers when owners change
    ...Array.from({ length: 6 }).flatMap((_, idx) => [
      watch(fp(`owners.${idx}.fullName`)),
      watch(fp(`owners.${idx}.address`)),
      watch(fp(`owners.${idx}.city`)),
      watch(fp(`owners.${idx}.state`)),
      watch(fp(`owners.${idx}.zipCode`)),
    ]),
    watch,
    setValue
  ]);

  // Auto-populate directors from owners when "Todos los accionistas son directores" is Yes
  // This happens in the background - no input fields are shown
  useEffect(() => {
    if (entityType === "C-Corp" || entityType === "S-Corp") {
      const currentDirectorsAllOwners = watch("admin.directorsAllOwners");
      const isAllOwnersDirectors = currentDirectorsAllOwners === "Yes" || currentDirectorsAllOwners === undefined;
      
      if (isAllOwnersDirectors) {
        if (currentDirectorsAllOwners === undefined) {
          setValue("admin.directorsAllOwners", "Yes", { shouldValidate: false });
        }
        
        const ownersCount = watch("ownersCount") || 1;
        const currentDirectorsCount = watch("admin.directorsCount");
        
        if (currentDirectorsCount !== ownersCount) {
          setValue("admin.directorsCount", ownersCount, { shouldValidate: false });
        }
        
        // Auto-populate each director's name and address from corresponding owner (in background)
        Array.from({ length: Math.min(ownersCount, 6) }).forEach((_, idx) => {
          const ownerName = watch(fp(`owners.${idx}.fullName`)) as string;
          const ownerAddress = watch(fp(`owners.${idx}.address`)) as string;
          const ownerCity = watch(fp(`owners.${idx}.city`)) as string;
          const ownerState = watch(fp(`owners.${idx}.state`)) as string;
          const ownerZipCode = watch(fp(`owners.${idx}.zipCode`)) as string;
          
          setValue(fp(`admin.director${idx + 1}Name`), ownerName || "", { shouldValidate: false });
          
          const fullOwnerAddress = ownerAddress || 
            (ownerCity || ownerState || ownerZipCode 
              ? [ownerAddress, ownerCity, ownerState, ownerZipCode].filter(Boolean).join(", ")
              : "");
          setValue(fp(`admin.director${idx + 1}Address`), fullOwnerAddress, { shouldValidate: false });
        });
      }
    }
  }, [
    entityType,
    directorsAllOwners,
    watch("ownersCount"),
    watch("admin.directorsAllOwners"),
    // Watch all owner fields to update directors when owners change
    ...Array.from({ length: 6 }).flatMap((_, idx) => [
      watch(fp(`owners.${idx}.fullName`)),
      watch(fp(`owners.${idx}.address`)),
      watch(fp(`owners.${idx}.city`)),
      watch(fp(`owners.${idx}.state`)),
      watch(fp(`owners.${idx}.zipCode`)),
    ]),
    watch,
    setValue
  ]);

  // Auto-populate officers from owners when "Todos los accionistas son oficiales" is Yes
  // This happens in the background - no input fields are shown
  useEffect(() => {
    if (entityType === "C-Corp" || entityType === "S-Corp") {
      const currentOfficersAllOwners = watch("admin.officersAllOwners");
      const isAllOwnersOfficers = currentOfficersAllOwners === "Yes" || currentOfficersAllOwners === undefined;
      
      if (isAllOwnersOfficers) {
        if (currentOfficersAllOwners === undefined) {
          setValue("admin.officersAllOwners", "Yes", { shouldValidate: false });
        }
        
        const ownersCount = watch("ownersCount") || 1;
        const currentOfficersCount = watch("admin.officersCount");
        
        if (currentOfficersCount !== ownersCount) {
          setValue("admin.officersCount", ownersCount, { shouldValidate: false });
        }
        
        // Auto-populate each officer's name and address from corresponding owner (in background)
        Array.from({ length: Math.min(ownersCount, 6) }).forEach((_, idx) => {
          const ownerName = watch(fp(`owners.${idx}.fullName`)) as string;
          const ownerAddress = watch(fp(`owners.${idx}.address`)) as string;
          const ownerCity = watch(fp(`owners.${idx}.city`)) as string;
          const ownerState = watch(fp(`owners.${idx}.state`)) as string;
          const ownerZipCode = watch(fp(`owners.${idx}.zipCode`)) as string;
          
          setValue(fp(`admin.officer${idx + 1}Name`), ownerName || "", { shouldValidate: false });
          
          const fullOwnerAddress = ownerAddress || 
            (ownerCity || ownerState || ownerZipCode 
              ? [ownerAddress, ownerCity, ownerState, ownerZipCode].filter(Boolean).join(", ")
              : "");
          setValue(fp(`admin.officer${idx + 1}Address`), fullOwnerAddress, { shouldValidate: false });
        });
      }
    }
  }, [
    entityType,
    officersAllOwners,
    watch("ownersCount"),
    watch("admin.officersAllOwners"),
    // Watch all owner fields to update officers when owners change
    ...Array.from({ length: 6 }).flatMap((_, idx) => [
      watch(fp(`owners.${idx}.fullName`)),
      watch(fp(`owners.${idx}.address`)),
      watch(fp(`owners.${idx}.city`)),
      watch(fp(`owners.${idx}.state`)),
      watch(fp(`owners.${idx}.zipCode`)),
    ]),
    watch,
    setValue
  ]);

  const handleContinue = async () => {
    // Ensure managersCount is set if managersAllOwners is "Yes" before validation
    if (entityType === "LLC") {
      const currentManagersAllOwners = watch("admin.managersAllOwners");
      if (currentManagersAllOwners === "Yes" || currentManagersAllOwners === undefined) {
        const ownersCount = watch("ownersCount") || 1;
        const currentManagersCount = watch("admin.managersCount");
        if (currentManagersCount !== ownersCount) {
          setValue("admin.managersCount", ownersCount, { shouldValidate: false });
          // Also ensure managersAllOwners is set to "Yes" if undefined
          if (currentManagersAllOwners === undefined) {
            setValue("admin.managersAllOwners", "Yes", { shouldValidate: false });
          }
        }
      }
    }
    
    if (!validateOfficers()) {
      return;
    }
    if (!validateManagers()) {
      return;
    }
    await onNext?.();
  };

  return (
    <section className="space-y-6">
      <HeroMiami1 title="Datos Administrativos" />

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Datos Administrativos</h2>
        <p className="mt-1 text-sm text-gray-600">
          {entityType === "C-Corp" || entityType === "S-Corp"
            ? "Configure directores y oficiales."
            : "Configure gerentes de la LLC."}
        </p>

        {entityType === "LLC" ? (
          <>
            {/* LLC — Gerentes */}
            <div className="mt-6">
              <div className="flex flex-col">
                <label className="label flex items-center gap-2">
                  ¿Todos los socios y solo los socios son los gerentes?
                  <InfoTooltip
                    title="Gerentes de la LLC"
                    body="Los gerentes son responsables de la gestión diaria de la LLC. Pueden ser socios o personas externas. Si todos los socios son gerentes, significa que cada socio tiene voz y voto en las decisiones operativas."
                  />
                </label>
                <Controller
                  name="admin.managersAllOwners"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={(field.value as string) ?? "Yes"}
                      onChange={(value) => {
                        field.onChange(value);
                        if (value === "Yes") {
                          const ownersCount = watch("ownersCount") || 1;
                          setValue("admin.managersCount", ownersCount, { shouldValidate: false });
                          
                          // Auto-populate manager names and addresses from owners (in background)
                          Array.from({ length: Math.min(ownersCount, 6) }).forEach((_, idx) => {
                            const ownerName = watch(fp(`owners.${idx}.fullName`)) as string;
                            const ownerAddress = watch(fp(`owners.${idx}.address`)) as string;
                            const ownerCity = watch(fp(`owners.${idx}.city`)) as string;
                            const ownerState = watch(fp(`owners.${idx}.state`)) as string;
                            const ownerZipCode = watch(fp(`owners.${idx}.zipCode`)) as string;
                            
                            setValue(fp(`admin.manager${idx + 1}Name`), ownerName || "", { shouldValidate: false });
                            
                            const fullOwnerAddress = ownerAddress || 
                              (ownerCity || ownerState || ownerZipCode 
                                ? [ownerAddress, ownerCity, ownerState, ownerZipCode].filter(Boolean).join(", ")
                                : "");
                            setValue(fp(`admin.manager${idx + 1}Address`), fullOwnerAddress, { shouldValidate: false });
                            setValue(fp(`admin.manager${idx + 1}SSN`), "", { shouldValidate: false });
                          });
                        } else {
                          // Clear managersCount and manager data when "No" is selected
                          // This ensures input fields are empty (not auto-filled)
                          setValue("admin.managersCount", undefined, { shouldValidate: false });
                          // Clear all manager names and addresses
                          Array.from({ length: 6 }).forEach((_, idx) => {
                            setValue(fp(`admin.manager${idx + 1}Name`), "", { shouldValidate: false });
                            setValue(fp(`admin.manager${idx + 1}Address`), "", { shouldValidate: false });
                            setValue(fp(`admin.manager${idx + 1}SSN`), "", { shouldValidate: false });
                          });
                        }
                      }}
                      options={[
                        { value: "Yes", label: "Sí" },
                        { value: "No", label: "No" },
                      ]}
                      ariaLabel="Socios son gerentes"
                      name={field.name}
                    />
                  )}
                />
              </div>
            </div>

            {managersAllOwners === "Yes" && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Todos los socios serán gerentes.
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  Número de gerentes: <strong>{watch("ownersCount") || 1}</strong>
                </p>
              </div>
            )}

            {managersAllOwners === "No" && (
              <>
                <div className="mt-6">
                  <label className="label">Número de gerentes</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    className={`input w-full max-w-xs ${
                      managersCountRaw !== undefined && 
                      (typeof managersCountRaw !== 'number' || managersCountRaw < 1 || managersCountRaw > 6 || isNaN(managersCountRaw))
                        ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500' 
                        : ''
                    }`}
                    onInput={(e) => {
                      const input = e.target as HTMLInputElement;
                      const value = Number(input.value);
                      // Prevent values greater than 6
                      if (value > 6) {
                        input.value = '6';
                        setValue("admin.managersCount", 6, { shouldValidate: true });
                      }
                    }}
                    {...register("admin.managersCount", { 
                      valueAsNumber: true,
                      validate: (value) => {
                        if (value === undefined || value === null) {
                          return true; // Allow empty initially
                        }
                        const num = typeof value === 'number' ? value : Number(value);
                        if (isNaN(num)) {
                          return "Ingrese un número válido";
                        }
                        if (num < 1) {
                          return "El número mínimo es 1";
                        }
                        if (num > 6) {
                          return "El número máximo es 6";
                        }
                        return true;
                      }
                    })}
                  />
                  {managersCountRaw !== undefined && 
                   (typeof managersCountRaw !== 'number' || managersCountRaw < 1 || managersCountRaw > 6 || isNaN(managersCountRaw)) && (
                    <p className="mt-1 text-sm text-red-600">
                      {managersCountRaw !== undefined && typeof managersCountRaw === 'number' && managersCountRaw > 6
                        ? "El número máximo de gerentes es 6."
                        : "Por favor ingrese un número válido de gerentes (entre 1 y 6)."}
                    </p>
                  )}
                </div>

                {managersCount && managersCount > 0 && Array.from({ length: Math.min(managersCount, 6) }).map((_, idx) => (
                  <div
                    key={idx}
                    className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-4"
                  >
                    {/* Nombre del Gerente - Split into First and Last */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Nombre(s) del Gerente {idx + 1}</label>
                        <input
                          className="input"
                          placeholder="Ej: Juan Carlos"
                          {...register(fp(`admin.manager${idx + 1}FirstName`))}
                        />
                      </div>
                      <div>
                        <label className="label">Apellido(s) del Gerente {idx + 1}</label>
                        <input
                          className="input"
                          placeholder="Ej: García López"
                          {...register(fp(`admin.manager${idx + 1}LastName`))}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Dirección del Gerente {idx + 1}</label>
                      <Controller
                        name={fp(`admin.manager${idx + 1}Address`)}
                        control={control}
                        render={({ field }) => (
                          <AddressAutocomplete
                            placeholder="Escriba y seleccione la dirección"
                            defaultValue={(field.value as string) ?? ""}
                            onSelect={(addr) => field.onChange(addr.fullAddress)}
                          />
                        )}
                      />
                    </div>

                    <div>
                      <label className="label">SSN del Gerente {idx + 1}</label>
                      <input
                        className="input"
                        placeholder="XXX-XX-XXXX"
                        {...register(fp(`admin.manager${idx + 1}SSN`))}
                      />
                      <p className="help">Solo si el gerente no es socio.</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {/* C-Corp — Directores */}
            <div className="mt-2 flex flex-col">
              <label className="label flex items-center gap-2">
                ¿Todos los accionistas y solo los accionistas serán los directores?
                <InfoTooltip
                  title="Directores de la Corporación"
                  body="Los directores son responsables de tomar las decisiones estratégicas de la corporación. Si todos los accionistas son directores, significa que cada accionista tiene derecho a participar en las decisiones importantes de la empresa. Esto es común en corporaciones pequeñas donde los accionistas quieren mantener control directo sobre la gestión."
                />
              </label>
              <Controller
                name="admin.directorsAllOwners"
                control={control}
                render={({ field }) => (
                  <SegmentedToggle
                    value={(field.value as string) ?? "Yes"}
                    onChange={(value) => {
                      field.onChange(value);
                      if (value === "Yes") {
                        const ownersCount = watch("ownersCount") || 1;
                        setValue("admin.directorsCount", ownersCount, { shouldValidate: false });
                        
                        // Auto-populate director names and addresses from owners (in background)
                        Array.from({ length: Math.min(ownersCount, 6) }).forEach((_, idx) => {
                          const ownerName = watch(fp(`owners.${idx}.fullName`)) as string;
                          const ownerAddress = watch(fp(`owners.${idx}.address`)) as string;
                          const ownerCity = watch(fp(`owners.${idx}.city`)) as string;
                          const ownerState = watch(fp(`owners.${idx}.state`)) as string;
                          const ownerZipCode = watch(fp(`owners.${idx}.zipCode`)) as string;
                          
                          setValue(fp(`admin.director${idx + 1}Name`), ownerName || "", { shouldValidate: false });
                          
                          const fullOwnerAddress = ownerAddress || 
                            (ownerCity || ownerState || ownerZipCode 
                              ? [ownerAddress, ownerCity, ownerState, ownerZipCode].filter(Boolean).join(", ")
                              : "");
                          setValue(fp(`admin.director${idx + 1}Address`), fullOwnerAddress, { shouldValidate: false });
                        });
                      } else {
                        // Clear directorsCount and director data when "No" is selected
                        // This ensures input fields are empty (not auto-filled)
                        setValue("admin.directorsCount", undefined, { shouldValidate: false });
                        // Clear all director names and addresses
                        Array.from({ length: 6 }).forEach((_, idx) => {
                          setValue(fp(`admin.director${idx + 1}Name`), "", { shouldValidate: false });
                          setValue(fp(`admin.director${idx + 1}Address`), "", { shouldValidate: false });
                        });
                      }
                    }}
                    options={[
                      { value: "Yes", label: "Sí" },
                      { value: "No", label: "No" },
                    ]}
                    ariaLabel="Accionistas serán directores"
                    name={field.name}
                  />
                )}
              />
            </div>

            {directorsAllOwners === "No" && (
              <>
                <div className="mt-6">
                  <label className="label">¿Número de directores?</label>
                  <input
                    className="input w-24"
                    type="number"
                    min={1}
                    step={1}
                    {...register("admin.directorsCount", { valueAsNumber: true })}
                  />
                  <p className="help">Debe elegir al menos un director.</p>
                </div>

                {Array.from({ length: directorsCount || 0 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-4"
                  >
                    {/* Nombre del Director - Split into First and Last */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Nombre(s) del Director {idx + 1}</label>
                        <input
                          className="input"
                          placeholder="Ej: Juan Carlos"
                          {...register(fp(`admin.director${idx + 1}FirstName`))}
                        />
                      </div>
                      <div>
                        <label className="label">Apellido(s) del Director {idx + 1}</label>
                        <input
                          className="input"
                          placeholder="Ej: García López"
                          {...register(fp(`admin.director${idx + 1}LastName`))}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Dirección completa del Director {idx + 1}</label>
                      <Controller
                        name={fp(`admin.director${idx + 1}Address`)}
                        control={control}
                        render={({ field }) => (
                          <AddressAutocomplete
                            placeholder="Escriba y seleccione la dirección"
                            defaultValue={(field.value as string) ?? ""}
                            onSelect={(addr) => field.onChange(addr.fullAddress)}
                          />
                        )}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* C-Corp — Oficiales (replicated pattern) */}
            <div className="mt-8 flex flex-col">
              <label className="label flex items-center gap-2">
                ¿Todos los accionistas y solo los accionistas serán los oficiales?
                <InfoTooltip
                  title="Oficiales de la Corporación"
                  body="Los oficiales son responsables de las operaciones diarias de la corporación (CEO, CFO, Secretario, etc.). Si todos los accionistas son oficiales, significa que cada accionista puede ocupar un cargo ejecutivo en la empresa. Esto es común en corporaciones pequeñas donde los accionistas quieren participar activamente en la gestión operativa."
                />
              </label>
              <Controller
                name="admin.officersAllOwners"
                control={control}
                render={({ field }) => (
                  <SegmentedToggle
                    value={(field.value as string) ?? "Yes"}
                    onChange={(value) => {
                      field.onChange(value);
                      if (value === "Yes") {
                        const ownersCount = watch("ownersCount") || 1;
                        setValue("admin.officersCount", ownersCount, { shouldValidate: false });
                        
                        // Auto-populate officer names and addresses from owners (in background)
                        Array.from({ length: Math.min(ownersCount, 6) }).forEach((_, idx) => {
                          const ownerName = watch(fp(`owners.${idx}.fullName`)) as string;
                          const ownerAddress = watch(fp(`owners.${idx}.address`)) as string;
                          const ownerCity = watch(fp(`owners.${idx}.city`)) as string;
                          const ownerState = watch(fp(`owners.${idx}.state`)) as string;
                          const ownerZipCode = watch(fp(`owners.${idx}.zipCode`)) as string;
                          
                          setValue(fp(`admin.officer${idx + 1}Name`), ownerName || "", { shouldValidate: false });
                          
                          const fullOwnerAddress = ownerAddress || 
                            (ownerCity || ownerState || ownerZipCode 
                              ? [ownerAddress, ownerCity, ownerState, ownerZipCode].filter(Boolean).join(", ")
                              : "");
                          setValue(fp(`admin.officer${idx + 1}Address`), fullOwnerAddress, { shouldValidate: false });
                        });
                      } else {
                        // When "No" is selected, set default to 1 (editable)
                        setValue("admin.officersCount", 1, { shouldValidate: false });
                        // Auto-assign President role to first officer when count is 1
                        setValue(fp("admin.officer1Role"), "President", { shouldValidate: false });
                        // Clear all officer names and addresses (user must enter manually)
                        Array.from({ length: 6 }).forEach((_, idx) => {
                          setValue(fp(`admin.officer${idx + 1}Name`), "", { shouldValidate: false });
                          setValue(fp(`admin.officer${idx + 1}Address`), "", { shouldValidate: false });
                        });
                      }
                    }}
                    options={[
                      { value: "Yes", label: "Sí" },
                      { value: "No", label: "No" },
                    ]}
                    ariaLabel="Accionistas serán oficiales"
                    name={field.name}
                  />
                )}
              />
            </div>

            {officersAllOwners === "Yes" && (
              <>
                <div className="mt-6">
                  <label className="label">Asignar roles a los accionistas</label>
                  <p className="text-sm text-amber-600 font-medium mb-4">
                    ⚠️ Al menos uno debe ser presidente
                  </p>
                  
                  {Array.from({ length: watch("ownersCount") || 1 }).map((_, idx) => {
                    // Get owner name - try firstName + lastName first, then fullName, then fallback
                    const ownerFirstName = watch(fp(`owners.${idx}.firstName`)) as string;
                    const ownerLastName = watch(fp(`owners.${idx}.lastName`)) as string;
                    const ownerFullName = watch(fp(`owners.${idx}.fullName`)) as string;
                    const ownerName = `${ownerFirstName || ""} ${ownerLastName || ""}`.trim() || ownerFullName || `Accionista ${idx + 1}`;
                    
                    return (
                      <div
                        key={idx}
                        className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl border border-gray-100 p-4"
                      >
                        <div>
                          <label className="label">Accionista {idx + 1}</label>
                          <div className="text-gray-700 font-medium">
                            {ownerName}
                          </div>
                        </div>
                        <div>
                          <label className="label">Rol</label>
                          <Controller
                            name={fp(`admin.shareholderOfficer${idx + 1}Role`)}
                            control={control}
                            render={({ field }) => {
                              const currentRole = field.value as string;
                              const otherSelectedRoles = Array.from({ length: watch("ownersCount") || 1 })
                                .map((_, roleIdx) => watch(fp(`admin.shareholderOfficer${roleIdx + 1}Role`)) as string)
                                .filter((role, roleIdx) => role && role !== "" && roleIdx !== idx);
                              const availableOptions = availableRoles.filter(role => 
                                !otherSelectedRoles.includes(role)
                              );
                              
                              return (
                                <select
                                  className="input"
                                  value={currentRole || ""}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    // If the new role was previously selected by another shareholder, clear it
                                    const newRole = e.target.value;
                                    if (newRole && newRole !== "") {
                                      Array.from({ length: watch("ownersCount") || 1 }).forEach((_, otherIdx) => {
                                        if (otherIdx !== idx) {
                                          const otherRole = watch(fp(`admin.shareholderOfficer${otherIdx + 1}Role`)) as string;
                                          if (otherRole === newRole) {
                                            setValue(fp(`admin.shareholderOfficer${otherIdx + 1}Role`), "");
                                          }
                                        }
                                      });
                                    }
                                  }}
                                >
                                  <option value="">Seleccionar rol</option>
                                  {availableOptions.map(role => (
                                    <option key={role} value={role}>
                                      {role}
                                      {currentRole === role ? " (Seleccionado)" : ""}
                                    </option>
                                  ))}
                                </select>
                              );
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {officersAllOwners === "No" && (
              <>
                <div className="mt-6">
                  <label className="label">¿Número de oficiales?</label>
                  <input
                    className="input w-24"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={1}
                    {...register("admin.officersCount", { 
                      valueAsNumber: true,
                      value: 1,
                    })}
                  />
                  <p className="help">
                    Debe elegir al menos un oficial con el rol de Presidente.
                  </p>
                </div>

                {Array.from({ length: officersCount || 0 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-4"
                  >
                    {/* Nombre del Oficial - Split into First and Last, plus Rol */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="label">Nombre(s) del Oficial {idx + 1}</label>
                        <input
                          className="input"
                          placeholder="Ej: Juan Carlos"
                          {...register(fp(`admin.officer${idx + 1}FirstName`))}
                        />
                      </div>
                      <div>
                        <label className="label">Apellido(s) del Oficial {idx + 1}</label>
                        <input
                          className="input"
                          placeholder="Ej: García López"
                          {...register(fp(`admin.officer${idx + 1}LastName`))}
                        />
                      </div>
                      <div>
                        <label className="label">Rol</label>
                        <Controller
                          name={fp(`admin.officer${idx + 1}Role`)}
                          control={control}
                          render={({ field }) => {
                            const currentRole = field.value as string;
                            const otherSelectedRoles = selectedRoles.filter((_, roleIdx) => roleIdx !== idx);
                            const availableOptions = availableRoles.filter(role => 
                              !otherSelectedRoles.includes(role)
                            );
                            
                            // Lock to President if there's only 1 officer
                            const isLocked = officersCount === 1 && idx === 0;
                            
                            return (
                              <select
                                className={`input ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={isLocked ? "President" : (currentRole || "")}
                                disabled={isLocked}
                                onChange={(e) => {
                                  if (isLocked) return; // Prevent changes when locked
                                  field.onChange(e);
                                  // If the new role was previously selected by another officer, clear it
                                  const newRole = e.target.value;
                                  if (newRole && newRole !== "") {
                                    Array.from({ length: officersCount || 0 }).forEach((_, otherIdx) => {
                                      if (otherIdx !== idx) {
                                        const otherRole = watch(`admin.officer${otherIdx + 1}Role`) as string;
                                        if (otherRole === newRole) {
                                          setValue(`admin.officer${otherIdx + 1}Role`, "");
                                        }
                                      }
                                    });
                                  }
                                }}
                              >
                                <option value="">Seleccionar rol</option>
                                {availableOptions.map(role => (
                                  <option key={role} value={role}>
                                    {role}
                                    {currentRole === role ? " (Seleccionado)" : ""}
                                  </option>
                                ))}
                              </select>
                            );
                          }}
                        />
                        {officersCount === 1 && idx === 0 && (
                          <p className="help text-gray-600 mt-1">
                            El rol de Presidente es obligatorio cuando hay solo un oficial.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="label">Dirección del Oficial {idx + 1}</label>
                      <Controller
                        name={fp(`admin.officer${idx + 1}Address`)}
                        control={control}
                        render={({ field }) => (
                          <AddressAutocomplete
                            placeholder="Escriba y seleccione la dirección"
                            defaultValue={(field.value as string) ?? ""}
                            onSelect={(addr) => field.onChange(addr.fullAddress)}
                          />
                        )}
                      />
                    </div>

                    <div>
                      <label className="label">SSN del Oficial {idx + 1}</label>
                      <input
                        className="input"
                        placeholder="XXX-XX-XXXX"
                        {...register(fp(`admin.officer${idx + 1}SSN`))}
                      />
                      <p className="help">Debe incluir el SSN del Presidente.</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* footer */}
        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <button
            type="button"
            className="btn"
            onClick={() => {
              // Go back one step reliably (supports functional updater if provided)
              try {
                (setStep as unknown as (u: (n: number) => number) => void)((n) =>
                  Math.max(1, n - 1)
                );
              } catch {
                setStep(2);
              }
            }}
          >
            Atrás
          </button>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-base underline text-blue-600 hover:text-blue-700"
              onClick={() => handleSaveWithAuth(session, anonymousId, form, onSave)}
            >
              Guardar y continuar más tarde
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleContinue}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}