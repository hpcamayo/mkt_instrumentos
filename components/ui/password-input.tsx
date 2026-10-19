"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { controlClasses } from "@/components/ui/field";
import { cn } from "@/lib/utils";

// Password field with a show/hide eye (auth-01): typing blind on a phone is the main cause of failed sign-ins.
// The eye is a real button (40 px) with a spoken label, and the field goes back to hidden after a submit.
export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn(controlClasses, "h-11 pr-12", className)}
      />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-controls={props.id}
        onClick={() => setVisible((value) => !value)}
        className="absolute right-0.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-control text-ink-2 transition-colors duration-120 hover:text-ink"
      >
        {visible ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
      </button>
    </div>
  );
}
