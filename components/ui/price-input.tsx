"use client";

import { useState, type InputHTMLAttributes } from "react";
import { controlClasses } from "@/components/ui/field";
import { formatPriceDigits } from "@/lib/price";
import { cn } from "@/lib/utils";

// Price in whole soles (auth-03): "S/" in front, thousands grouped while typing ("1,250"), numeric keypad.
// The submitted text keeps the grouping; parseWholeSolPrice in lib/price.ts reads "1,250" and "S/ 1,250" as 1250.
export function PriceInput({
  className,
  defaultValue,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "defaultValue" | "value" | "inputMode"> & {
  defaultValue?: number | string | null;
}) {
  const [value, setValue] = useState(() => (defaultValue === null || defaultValue === undefined ? "" : formatPriceDigits(String(defaultValue))));
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] leading-6 text-ink-2">
        S/
      </span>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          setValue(formatPriceDigits(event.target.value));
          onChange?.(event);
        }}
        className={cn(controlClasses, "h-11 pl-10 tabular-nums", className)}
      />
    </div>
  );
}
