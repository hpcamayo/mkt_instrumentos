"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// The review rating as five tappable stars (trust-02). Native radios named "rating", so the form's FormData carries
// the value, one tab stop and arrow keys come from the browser, and `required` blocks an empty submit. Each radio is
// labelled "1 estrella" … "5 estrellas". The choice reads by shape (filled vs outline) and by the "4 de 5" text,
// never by color alone. Nothing is chosen in advance.
export function StarRating({ name = "rating", legend = "Calificación", disabled = false }: { name?: string; legend?: string; disabled?: boolean }) {
  const [value, setValue] = useState(0);
  const [preview, setPreview] = useState(0);
  const shown = preview || value;
  return (
    <fieldset className="grid min-w-0 gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 t-ui font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex" onMouseLeave={() => setPreview(0)}>
          {[1, 2, 3, 4, 5].map((rating) => (
            <label
              key={rating}
              onMouseEnter={() => setPreview(rating)}
              className={cn(
                "relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-control text-ink",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                "has-[:disabled]:cursor-not-allowed",
              )}
            >
              <input
                type="radio"
                name={name}
                value={rating}
                required
                checked={value === rating}
                onChange={() => setValue(rating)}
                className="sr-only"
              />
              <Star
                aria-hidden
                strokeWidth={1.75}
                className={cn("h-8 w-8 transition-colors duration-120", rating <= shown ? "fill-accent" : "fill-transparent")}
              />
              <span className="sr-only">{rating} {rating === 1 ? "estrella" : "estrellas"}</span>
            </label>
          ))}
        </div>
        <p className="t-ui font-semibold text-ink" aria-live="polite">
          {value ? `${value} de 5` : <span className="font-normal text-ink-2">Toca una estrella</span>}
        </p>
      </div>
    </fieldset>
  );
}
