import Link from "next/link";
import { Clock, Hammer, Mic2 } from "lucide-react";
import { getListingMarks } from "@/lib/discovery/data";
import { ARTISTS_PATH, ARTIST_DISCLAIMER, MAKERS_PATH, MAKER_DISCLAIMER, handmadeLabel, madeToOrderLabel } from "@/lib/discovery/makers";

// disc-04 and disc-05 on the listing page: "Hecho a mano en Ayacucho", "Se hace a pedido: 3 semanas" and the verified
// artist's note, each with whose word it is. Renders nothing when the listing has no marks or the read fails (the marks
// are extra; the page never waits on them for long).
export async function ListingMarks({ listingId }: { listingId: string }) {
  const marks = await getListingMarks([listingId]);
  const mark = marks?.[0];
  if (!mark || (!mark.handmade && !mark.made_to_order_weeks && !mark.artist)) return null;
  return (
    <div className="mt-3 grid gap-2 rounded-panel bg-canvas p-3">
      {mark.maker && (mark.handmade || mark.made_to_order_weeks) ? (
        <div className="grid gap-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 t-ui font-semibold text-ink">
            {mark.handmade ? (
              <span className="inline-flex items-center gap-1.5"><Hammer aria-hidden className="h-4 w-4" />{handmadeLabel(mark.maker)}</span>
            ) : null}
            {mark.made_to_order_weeks ? (
              <span className="inline-flex items-center gap-1.5"><Clock aria-hidden className="h-4 w-4" />{madeToOrderLabel(mark.made_to_order_weeks)}</span>
            ) : null}
          </p>
          <p className="t-meta">
            {MAKER_DISCLAIMER}{" "}
            <Link href={`${MAKERS_PATH}#${mark.maker.store_slug}`} className="link">Conoce a {mark.maker.store_name}</Link>
          </p>
        </div>
      ) : null}
      {mark.artist ? (
        <div className="grid gap-1">
          <p className="inline-flex flex-wrap items-center gap-1.5 t-ui font-semibold text-ink">
            <Mic2 aria-hidden className="h-4 w-4" />
            Equipo de {mark.artist.display_name} · Identidad verificada por Laria
          </p>
          {mark.artist_note ? <p className="t-ui text-ink">«{mark.artist_note}»</p> : null}
          <p className="t-meta">
            {ARTIST_DISCLAIMER}{" "}
            <Link href={`${ARTISTS_PATH}#${mark.artist.slug}`} className="link">Ver más equipo de artistas</Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
