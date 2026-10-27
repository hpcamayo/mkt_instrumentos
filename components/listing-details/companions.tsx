import Image from "next/image";
import Link from "next/link";
import { ComboToggle } from "@/components/listing-details/combo";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

// buy-01 "Lo que suele acompañarlo": up to six listings of the same store the store attaches to this one
// (listing_companions; only public ones are read). Each can go into the buyer's combo.
export type Companion = { id: string; title: string; slug: string; price_pen: number | null; photo: { url: string; alt: string | null } | null };

export function CompanionList({ companions, seller, className }: {
  companions: Companion[];
  seller: { key: string; name: string; type: "individual" | "store" } | null;
  className?: string;
}) {
  if (!companions.length) return null;
  return (
    <section aria-labelledby="lo-que-acompana" className={cn("min-w-0", className)}>
      <h2 id="lo-que-acompana" className="t-section text-ink">Lo que suele acompañarlo</h2>
      <p className="mt-1 t-meta">Lo sugiere la tienda. Agrégalo a tu combo para pedirlo en el mismo mensaje.</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {companions.map((companion) => (
          <li key={companion.id} className="flex min-w-0 items-center gap-3 rounded-panel border border-subtle p-2.5">
            <Link href={`/instrumentos/${companion.slug}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control bg-canvas" tabIndex={-1} aria-hidden>
              {companion.photo ? <Image src={companion.photo.url} alt="" fill sizes="64px" className="object-cover" /> : null}
            </Link>
            <div className="grid min-w-0 flex-1 gap-1">
              <Link href={`/instrumentos/${companion.slug}`} className="link line-clamp-2 t-ui font-semibold">{companion.title}</Link>
              <span className="t-ui tabular-nums text-ink">{formatPrice(companion.price_pen)}</span>
              {seller ? <ComboToggle seller={seller} item={{ id: companion.id, title: companion.title, slug: companion.slug, price_pen: companion.price_pen }} size="sm" /> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
