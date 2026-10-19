import { Clock, MapPin } from "lucide-react";
import type { PublicStoreLocation } from "@/lib/store-storefront";
import { cn } from "@/lib/utils";

// list-12: "¿Puedo ir a probarlo?". The street address (only when the store agreed to show it, see
// publicStoreLocation), a "Cómo llegar" link to a Google Maps search that opens in a new tab, and the opening hours as
// the store wrote them. Renders nothing when the store shows neither.

export function MapsLink({ href, className }: { href: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("link inline-flex min-h-6 items-center font-semibold", className)}>
      Cómo llegar
      <span className="sr-only"> (abre Google Maps en otra pestaña)</span>
    </a>
  );
}

// Compact lines for the store header and the seller card on a listing: an icon, the text and the link.
export function StoreVisitLines({ location, className }: { location: PublicStoreLocation; className?: string }) {
  if (!location.address && !location.hours) return null;
  return (
    <ul className={cn("grid gap-1.5 t-meta text-ink", className)}>
      {location.address ? (
        <li className="flex gap-2">
          <MapPin aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="sr-only">Dirección: </span>
            <span className="break-words">{location.address}</span>
            {location.mapsHref ? (
              <>
                <span aria-hidden="true" className="mx-1.5 text-ink-3">·</span>
                <MapsLink href={location.mapsHref} />
              </>
            ) : null}
          </span>
        </li>
      ) : null}
      {location.hours ? (
        <li className="flex gap-2">
          <Clock aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          <span className="min-w-0 whitespace-pre-line break-words">
            <span className="sr-only">Horario de atención: </span>
            {location.hours}
          </span>
        </li>
      ) : null}
    </ul>
  );
}
