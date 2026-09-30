"use client";

import { useState, type TextareaHTMLAttributes } from "react";
import { controlClasses } from "@/components/ui/field";
import { cn } from "@/lib/utils";

// Multi-line control. With maxLength it shows a live "n / max" counter under the field.
export function Textarea({ className, maxLength, onChange, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [count, setCount] = useState(String(props.value ?? props.defaultValue ?? "").length);
  const textarea = (
    <textarea
      className={cn(controlClasses, "min-h-28 py-2.5", className)}
      maxLength={maxLength}
      onChange={(event) => {
        setCount(event.target.value.length);
        onChange?.(event);
      }}
      {...props}
    />
  );
  if (!maxLength) return textarea;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {textarea}
      <span className="self-end t-meta tabular-nums" aria-live="polite">
        {count.toLocaleString("es-PE")} / {maxLength.toLocaleString("es-PE")}
      </span>
    </div>
  );
}
