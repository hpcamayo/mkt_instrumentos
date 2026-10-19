"use client";

import { useState, type InputHTMLAttributes } from "react";
import { controlClasses } from "@/components/ui/field";
import { buildWhatsAppHref, formatPhoneForDisplay, isValidWhatsAppPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

// WhatsApp field (fix-01, auth-03). A "+51" prefix sits in front unless the person types another country code,
// and the line below shows the number buyers will see, with a link to try it in WhatsApp. The input keeps the
// text as typed under `name`; lib/phone.ts and the database add the 51 when saving.
export function PhoneInput({
  className,
  defaultValue,
  onChange,
  showPreview = true,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "defaultValue" | "value"> & {
  defaultValue?: string | null;
  showPreview?: boolean;
}) {
  const [value, setValue] = useState(() => (defaultValue ? formatPhoneForDisplay(defaultValue) : ""));
  const hasOwnCountryCode = value.trim().startsWith("+");
  const valid = isValidWhatsAppPhone(value);
  const previewId = props.id ? `${props.id}-numero` : undefined;
  const describedBy = [props["aria-describedby"], showPreview && valid ? previewId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="relative">
        {hasOwnCountryCode ? null : (
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] leading-6 text-ink-2">
            +51
          </span>
        )}
        <input
          {...props}
          type="tel"
          inputMode="tel"
          autoComplete={props.autoComplete ?? "tel"}
          value={value}
          aria-describedby={describedBy}
          placeholder={props.placeholder ?? "987 654 321"}
          onChange={(event) => {
            setValue(event.target.value);
            onChange?.(event);
          }}
          className={cn(controlClasses, "h-11", hasOwnCountryCode ? "" : "pl-12", className)}
        />
      </div>
      {showPreview && valid ? (
        <p id={previewId} className="flex flex-wrap items-center gap-x-2 t-meta">
          <span>
            Así te contactarán: <strong className="font-semibold text-ink tabular-nums">{formatPhoneForDisplay(value)}</strong>
          </span>
          <a href={buildWhatsAppHref(value)} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-6 items-center font-semibold">
            Probar en WhatsApp
          </a>
        </p>
      ) : null}
    </div>
  );
}
