"use client";

type Props = {
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  isSubmit?: boolean; // when true, renders a submit button instead of calling onContinue
};

export default function StepFooter({
  onBack,
  onContinue,
  continueLabel = "Continuar",
  isSubmit = false,
}: Props) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {onBack ? (
        <button type="button" className="btn" onClick={onBack}>
          Atrás
        </button>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="text-sm text-gray-700 hover:underline"
          onClick={() => alert("Se guardará como borrador…")}
        >
          Guardar y continuar más tarde
        </button>

        {isSubmit ? (
          <button type="submit" className="btn btn-primary">
            {continueLabel}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onContinue}
          >
            {continueLabel}
          </button>
        )}
      </div>
    </div>
  );
}