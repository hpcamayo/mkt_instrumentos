import { AlertCircle, Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The sell and edit forms' radio groups (docs/ux-redesign/ux-5-selling.md S3, S4). Native radios, so one tab stop and
// arrow keys come from the browser; the label carries the look. The first radio takes the group's id, so an error
// summary link lands on the group.

type Option = { value: string; label: string; description?: string };

function GroupError({ id, error }: { id: string; error?: ReactNode }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="flex items-start gap-1.5 t-ui font-semibold text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{error}</span>
    </p>
  );
}

function groupProps(id: string, error?: ReactNode) {
  return { "aria-describedby": error ? `${id}-error` : undefined, "aria-invalid": error ? true : undefined } as const;
}

// Instrument type as chips: 44 px tall, ink check and accent fill when chosen.
export function TypeChips({
  id,
  name,
  legend,
  options,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  name: string;
  legend: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  error?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
      <legend className="mb-1.5 t-ui font-semibold text-ink">{legend}</legend>
      <GroupError id={id} error={error} />
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => (
          <label
            key={option.value}
            className={cn(
              "relative inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-control px-3.5 text-[14px] font-semibold leading-5 text-ink transition-colors duration-120",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
              value === option.value ? "bg-accent" : "border border-line-strong bg-surface hover:bg-canvas",
              error && value !== option.value && "border-danger",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              id={index === 0 ? id : undefined}
              className="sr-only"
              {...groupProps(id, error)}
            />
            {value === option.value ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Condition as cards with a one-line definition. Uncontrolled unless `value` is passed.
export function ConditionCards({
  id,
  name,
  legend,
  options,
  defaultValue,
  error,
}: {
  id: string;
  name: string;
  legend: string;
  options: readonly Option[];
  defaultValue?: string;
  error?: ReactNode;
}) {
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-1.5 t-ui font-semibold text-ink">{legend}</legend>
      <GroupError id={id} error={error} />
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option, index) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-panel border border-line-strong bg-surface p-3 transition-colors duration-120 hover:bg-canvas",
              "has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--ink)]",
              error && "border-danger",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
              id={index === 0 ? id : undefined}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ink"
              {...groupProps(id, error)}
            />
            <span className="min-w-0">
              <span className="block t-ui font-semibold text-ink">{option.label}</span>
              {option.description ? <span className="mt-0.5 block t-meta">{option.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// A numbered section of the sell form: "1 Fotos", "2 El instrumento"…
export function FormSection({ id, step, title, hint, children }: { id: string; step?: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-4 border-t border-subtle pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 id={id} className="flex items-baseline gap-2 t-section text-ink">
          {step ? <span aria-hidden className="t-ui font-semibold text-ink-2">{step}</span> : null}
          {title}
        </h2>
        {hint ? <div className="mt-1 t-meta">{hint}</div> : null}
      </div>
      {children}
    </section>
  );
}
