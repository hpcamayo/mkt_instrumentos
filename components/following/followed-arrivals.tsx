import Link from "next/link";
import { MarketplaceImage } from "@/components/marketplace-image";
import { Price } from "@/components/ui/price";
import { arrivalReason, type FollowedArrival } from "@/lib/follows";

// save-12: what is new from the stores and brands the account follows, on the home above "Para ti"
// (components/home/home-followed.tsx) and in Favoritos. Each card says why it is there, and the list is finite: the
// newest arrivals of the last weeks, never an endless feed.
export function FollowedArrivals({ arrivals, title = "Nuevo de lo que sigues" }: { arrivals: FollowedArrival[]; title?: string }) {
  if (!arrivals.length) return null;
  return (
    <section aria-labelledby="lo-que-sigues" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="lo-que-sigues" className="t-section text-ink">{title}</h2>
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
