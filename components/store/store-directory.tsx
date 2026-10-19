import Link from "next/link";
import { RatingFigure, SellerAvatar, SellerKindMark } from "@/components/listing/seller-card";
import { ChipLink } from "@/components/ui/chip";
import { listingCountLabel } from "@/lib/listing-page";
import { storeDirectoryHref, storeRating, type DirectoryStore, type StoreDirectoryView } from "@/lib/store-storefront";
import { cn } from "@/lib/utils";

// find-13: the stores directory (/tiendas). Two tabs that are links, so each has its own URL: "Tiendas" (the active
// stores, verified first) and "Publicaciones de tiendas verificadas" (their listings). Same pattern as Inventario's
// view tabs: an ink underline and aria-current="page" on the current one.
export function StoreDirectoryTabs({ view }: { view: StoreDirectoryView }) {
  const tabs = [
    { key: "tiendas", label: "Tiendas", href: storeDirectoryHref() },
    { key: "publicaciones", label: "Publicaciones de tiendas verificadas", href: storeDirectoryHref({ view: "publicaciones" }) },
  ] as const;
  return (
    <nav aria-label="Vista de tiendas" className="scrollbar-none -mx-4 overflow-x-auto border-b border-line-deco px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {tabs.map((tab) => (
          <li key={tab.key} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={view === tab.key ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 t-ui font-semibold focus-visible:outline-offset-[-2px]",
                view === tab.key ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// City chips: "Todas" and every city that has a store, with how many stores each has.
export function StoreCityChips({ cities, current, total }: { cities: { city: string; count: number }[]; current?: string; total: number }) {
  if (cities.length < 2 && !current) return null;
  return (
    <nav aria-label="Ciudades">
      <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        <li className="shrink-0">
          <ChipLink href={storeDirectoryHref()} selected={!current} current="page">
            Todas <span className="t-meta tabular-nums">{total}</span>
          </ChipLink>
        </li>
        {cities.map(({ city, count }) => {
          const selected = current?.toLocaleLowerCase("es-PE") === city.toLocaleLowerCase("es-PE");
          return (
            <li key={city} className="shrink-0">
              <ChipLink href={selected ? storeDirectoryHref() : storeDirectoryHref({ city })} selected={selected} current="page">
                {city} <span className="t-meta tabular-nums">{count}</span>
              </ChipLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// One store: logo or initials, name, "Tienda verificada" or "Tienda", the place and real figures only (rating from
// verified transactions, public listings). The whole card is one link to the store page.
export function StoreDirectoryCard({ store }: { store: DirectoryStore }) {
  const kind = store.is_verified ? "verified" : "store";
  const place = [store.district, store.city, store.region && store.region !== store.city ? store.region : null].filter(Boolean).join(", ");
  const rating = storeRating(store);
  return (
    <Link
      href={`/tiendas/${store.slug}`}
      className="group flex h-full gap-3 rounded-panel border border-subtle bg-surface p-4 transition-colors duration-120 hover:border-line-strong"
    >
      <SellerAvatar seller={{ name: store.name, kind, logoUrl: store.logo_url }} size={64} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="break-words t-card-title text-ink decoration-accent decoration-2 underline-offset-[3px] group-hover:underline">
          {store.name}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SellerKindMark kind={kind} />
        </span>
        {place ? <span className="t-meta">{place}</span> : null}
        <span className="t-meta text-ink [&>span+span]:before:mx-1.5 [&>span+span]:before:text-ink-3 [&>span+span]:before:content-['·']">
          {rating ? <span><RatingFigure rating={rating} /></span> : null}
          <span>{listingCountLabel(store.listing_count)}</span>
        </span>
      </span>
    </Link>
  );
}

export const STORE_DIRECTORY_GRID = "grid gap-3 sm:grid-cols-2 md:gap-5 lg:grid-cols-3 xl:grid-cols-4";
