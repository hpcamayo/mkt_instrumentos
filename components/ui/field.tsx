import { AlertCircle, ChevronDown } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

// Label above, control, then the error and the hint. The control gets its id, aria-describedby and
// aria-invalid from the Field, so every error is announced with the field it belongs to.
export function Field({
  id,
  label,
  hint,
  error,
  optional = false,
  className,
  labelClassName,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  className?: string;
  labelClassName?: string;
  children: ReactElement<ControlProps>;
}) {
  const hintId = hint ? `${id}-ayuda` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId, children.props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })
    : children;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("t-ui font-semibold text-ink", labelClassName)}>
        {label}
        {optional ? <span className="font-normal text-ink-2"> (opcional)</span> : null}
      </label>
      {control}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 t-ui font-semibold text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="t-meta">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const controlClasses =
  "w-full rounded-control border border-line-strong bg-surface px-3 text-[16px] leading-6 text-ink placeholder:text-ink-3 transition-colors duration-120 disabled:cursor-not-allowed disabled:border-subtle disabled:bg-canvas disabled:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--danger)]";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, "h-11", className)} {...props} />;
}

// Native file picker styled as a control; the picker button reads as a secondary button.
export function FileInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      type="file"
      className={cn(
        controlClasses,
        "h-auto cursor-pointer py-2 text-[14px] leading-5 file:mr-3 file:h-9 file:cursor-pointer file:rounded-control file:border file:border-solid file:border-line-strong file:bg-surface file:px-3 file:font-semibold file:text-ink hover:file:bg-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select className={cn(controlClasses, "h-11 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink" aria-hidden />
    </div>
  );
}

function Choice({
  type,
  label,
  description,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type: "checkbox" | "radio";
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-2.5 py-2.5 t-body text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-3", className)}>
      <input type={type} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ink disabled:cursor-not-allowed" {...props} />
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description ? <span className="block t-meta">{description}</span> : null}
      </span>
    </label>
  );
}

export function Checkbox(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; description?: ReactNode }) {
  return <Choice type="checkbox" {...props} />;
}

export function Radio(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; description?: ReactNode }) {
  return <Choice type="radio" {...props} />;
}
