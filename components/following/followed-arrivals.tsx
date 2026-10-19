import Link from "next/link";
import { MarketplaceImage } from "@/components/marketplace-image";
import { Price } from "@/components/ui/price";
import { arrivalReason, type FollowedArrival } from "@/lib/follows";

// save-12: "Para ti" from what the account follows. Each card says why it is there, and the list is finite: the
// newest arrivals of the last 30 days, never an endless feed. The find batch places it on the home page.
export function FollowedArrivals({ arrivals, title = "Para ti" }: { arrivals: FollowedArrival[]; title?: string }) {
  if (!arrivals.length) return null;
  return (
    <section aria-labelledby="para-ti" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="para-ti" className="t-section text-ink">{title}</h2>
        <Link href="/mi-cuenta/correos#sigues" className="link t-ui font-semibold">Lo que sigues</Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {arrivals.map((arrival) => (
          <li key={arrival.id} className="min-w-0 rounded-panel border border-subtle bg-white p-3">
            <Link href={`/instrumentos/${arrival.slug}`} className="grid gap-2">
              {arrival.image_url ? <MarketplaceImage src={arrival.image_url} alt="" width={320} height={240} sizes="(max-width: 640px) 50vw, 240px" loading="lazy" className="aspect-[4/3] w-full rounded-control object-cover" /> : null}
              <span className="t-ui font-semibold text-ink">{arrival.title}</span>
            </Link>
            <Price value={arrival.price_pen} />
            <p className="mt-1 t-meta">{arrivalReason(arrival)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
