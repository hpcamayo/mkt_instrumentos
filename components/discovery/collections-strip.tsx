import Link from "next/link";
import { COLLECTIONS_PATH, collectionPath, type Collection } from "@/lib/discovery/collections";
import { GIFTS_PATH } from "@/lib/discovery/gift-finder";

// disc-03 and buy-05 on the home: the current collections as a short row of cards (title and text), at most three,
// then the gift finder's card and "Ver todas". Fresh variety without a feed. Without collections (none, or the read
// failed) the row keeps the gift finder's card only.
export function CollectionsStrip({ collections }: { collections: Collection[] | null }) {
  const all = collections ?? [];
  const shown = all.slice(0, 3);
  return (
    <section aria-labelledby="colecciones-titulo">
      <div className="mb-3 flex items-center justify-between gap-4 md:mb-4">
        <h2 id="colecciones-titulo" className="t-section text-ink">{shown.length ? "Colecciones" : "Ideas para buscar"}</h2>
        {all.length > shown.length ? <Link href={COLLECTIONS_PATH} className="link t-ui font-semibold">Ver todas</Link> : null}
      </div>
      <ul className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-4">
        {shown.map((collection) => (
          <li key={collection.id} className="w-[260px] shrink-0 md:w-auto">
            <Link href={collectionPath(collection.slug)} className="flex h-full flex-col gap-1 rounded-panel border border-subtle bg-surface p-4 transition-colors duration-120 hover:bg-canvas">
              <span className="t-card-title text-ink">{collection.title}</span>
              <span className="line-clamp-3 t-ui text-ink-2">{collection.intro}</span>
            </Link>
          </li>
        ))}
        <li className="w-[260px] shrink-0 md:w-auto">
          <Link href={GIFTS_PATH} className="flex h-full flex-col gap-1 rounded-panel bg-canvas p-4 transition-colors duration-120 hover:bg-subtle">
            <span className="t-card-title text-ink">Para regalar</span>
            <span className="line-clamp-3 t-ui text-ink-2">Elige para quién es y tu presupuesto, y mira instrumentos y accesorios reales.</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
