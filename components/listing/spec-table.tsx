import type { ListingSpec } from "@/lib/listing-specs";
import { cn } from "@/lib/utils";

// The key-spec strip (UX-4 L9 A): up to four of the type's attributes in bordered cells, three a row on phones. None
// when the listing has no attributes.
export function SpecStrip({ specs, className }: { specs: ListingSpec[]; className?: string }) {
  if (specs.length === 0) return null;
  return (
    <dl className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", className)}>
      {specs.map((spec) => (
        <div key={spec.label} className="min-w-0 rounded-control border border-subtle px-3 py-2">
          <dt className="break-words t-meta">{spec.label}</dt>
          <dd className="break-words t-ui font-semibold text-ink">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// "Especificaciones" (UX-4 L9 A): two columns of 44 px rows from 1024 px, one on phones; label ink-2 on the left, the
// value in ink 600 on the right, line-deco separators. Empty rows were left out by getSpecTable.
export function SpecTable({ specs, className }: { specs: ListingSpec[]; className?: string }) {
  return (
    <section aria-labelledby="especificaciones" className={className}>
      <h2 id="especificaciones" className="t-section text-ink">Especificaciones</h2>
      <dl className="mt-3 grid t-ui lg:grid-cols-2 lg:gap-x-8">
        {specs.map((spec) => (
          <div key={spec.label} className="flex min-h-11 items-center justify-between gap-4 border-b border-line-deco py-2">
            <dt className="text-ink-2">{spec.label}</dt>
            <dd className="min-w-0 break-words text-right font-semibold text-ink">{spec.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
