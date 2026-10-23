"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { Price } from "@/components/ui/price";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { getCardSpecLine, getSpecStrip, getSpecTable } from "@/lib/listing-specs";
import { getCategoryLabel } from "@/lib/listings";

// POST 10: what buyers will see, before sending. The card copies the catalog card's grid variant (ListingCard) and the
// page a simplified listing page, without links, favourites or telemetry: nothing here exists yet. The trust line is
// the listing page's own (decisions.md U1).

export type PreviewListing = {
  title: string;
  category: string;
  instrumentType: string;
  brand: string;
  model: string;
  condition: string;
  price: number | null;
  city: string;
  region: string;
  description: string;
  attributes: Record<string, string | string[]>;
  photos: string[];
  seller: { name: string; label: "Particular" | "Tienda" | "Tienda verificada" };
  hasSound: boolean;
};

export function ListingCardPreview({ listing }: { listing: PreviewListing }) {
  const spec = getCardSpecLine({ condition: listing.condition, instrument_type: listing.instrumentType, attributes: listing.attributes });
  return (
    <figure className="grid w-full max-w-[260px] gap-2" aria-label="Vista previa de la tarjeta">
      <div className="relative aspect-square overflow-hidden rounded-panel border border-subtle bg-canvas">
        {listing.photos[0] ? (
          <Image src={listing.photos[0]} alt="" fill unoptimized sizes="260px" className="object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <ImageOff className="h-8 w-8 text-ink-3" aria-hidden />
            <span className="t-meta font-semibold">Sin foto</span>
          </div>
        )}
        {listing.photos.length > 1 ? (
          <span className="absolute bottom-2 left-2 rounded-tag bg-frame/75 px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-white">{listing.photos.length} fotos</span>
        ) : null}
      </div>
      <figcaption className="flex min-w-0 flex-col gap-1">
        <p className="line-clamp-2 min-h-[38px] t-card-title text-ink">{listing.title || "Tu título aparecerá aquí"}</p>
        <p>{listing.price === null ? <span className="t-ui text-ink-2">Tu precio</span> : <Price value={listing.price} />}</p>
        {spec ? <p className="truncate t-meta">{spec}</p> : null}
        <p className="flex min-w-0 items-center gap-1 t-meta">
          <span className="min-w-0 truncate">{listing.city || "Tu ciudad"}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{listing.seller.label}</span>
          {listing.seller.label === "Tienda verificada" ? <VerifiedIcon className="h-3.5 w-3.5" /> : null}
        </p>
      </figcaption>
    </figure>
  );
}

export function ListingPagePreview({ listing }: { listing: PreviewListing }) {
  const strip = getSpecStrip({ instrument_type: listing.instrumentType, attributes: listing.attributes });
  const table = getSpecTable({ category: listing.category, instrument_type: listing.instrumentType, attributes: listing.attributes, brand: listing.brand, model: listing.model, condition: listing.condition });
  return (
    <article className="grid gap-5 rounded-panel border border-subtle bg-surface p-4" aria-label="Vista previa de la página">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <div className="relative aspect-[4/3] overflow-hidden rounded-panel bg-canvas">
          {listing.photos[0] ? <Image src={listing.photos[0]} alt="" fill unoptimized sizes="600px" className="object-contain" /> : null}
        </div>
        <ul className="grid grid-cols-4 content-start gap-2 sm:grid-cols-2">
          {listing.photos.slice(1, 5).map((url, index) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-control bg-canvas">
              <Image src={url} alt="" fill unoptimized sizes="120px" className="object-cover" />
              {index === 3 && listing.photos.length > 5 ? <span className="absolute inset-0 grid place-items-center bg-frame/60 t-ui font-semibold text-white">+{listing.photos.length - 5}</span> : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-1">
        <p className="t-micro text-ink-2">{listing.category ? getCategoryLabel(listing.category) : "Categoría"}</p>
        <p className="t-section text-ink">{listing.title || "Tu título aparecerá aquí"}</p>
        <Price value={listing.price} size="detail" />
        <p className="t-meta">{[listing.city, listing.region].filter(Boolean).join(", ")} · Publicado hoy</p>
      </div>
      {strip.length ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {strip.map((spec) => (
            <div key={spec.label} className="rounded-control bg-canvas p-2">
              <dt className="t-micro text-ink-2">{spec.label}</dt>
              <dd className="t-ui font-semibold text-ink">{spec.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {listing.hasSound ? <p className="t-ui text-ink">▶ Escuchar el sonido (se reproduce solo al tocarlo)</p> : null}
      <section className="grid gap-1">
        <p className="t-ui font-semibold text-ink">Descripción</p>
        <p className="whitespace-pre-line t-body text-ink">{listing.description || "Tu descripción aparecerá aquí."}</p>
      </section>
      {table.length ? (
        <section className="grid gap-1">
          <p className="t-ui font-semibold text-ink">Especificaciones</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 t-ui">
            {table.map((spec) => <div key={spec.label} className="contents"><dt className="text-ink-2">{spec.label}</dt><dd className="text-ink">{spec.value}</dd></div>)}
          </dl>
        </section>
      ) : null}
      <section className="grid gap-1 rounded-panel bg-canvas p-3">
        <p className="t-ui font-semibold text-ink">{listing.seller.name}</p>
        <p className="t-meta">{listing.seller.label} · Contacto por WhatsApp</p>
        <p className="t-meta">Coordinas el pago y la entrega directamente con quien vende. Laria no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza el equipo o la transacción.</p>
      </section>
    </article>
  );
}
