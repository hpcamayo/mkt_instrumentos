import type { ReactNode } from "react";
import { ContentReport } from "@/components/content-report";
import { TRUST_COPY } from "@/components/listing/trust-note";
import { StorePhotos } from "@/components/store/store-photos";
import { MapsLink } from "@/components/store/store-visit";
import { safeExternalUrl } from "@/lib/listing-page";
import type { ListingPhotoData } from "@/lib/listings";
import type { PublicStoreLocation } from "@/lib/store-storefront";

// The section links under the store header (UX-4 L16 A): links to sections that are all on the page, not tabs.
export function StoreSectionLinks({ total, reviews }: { total: number | null; reviews: number | null }) {
  const items = [
    { href: "#publicaciones", label: "Publicaciones", count: total },
    ...(reviews !== null ? [{ href: "#resenas", label: "Reseñas", count: reviews }] : []),
    { href: "#sobre-la-tienda", label: "Sobre la tienda", count: null },
  ];
  return (
    <nav aria-label="Secciones de la tienda" className="border-b border-line-deco bg-surface">
      <ul className="scrollbar-none mx-auto flex max-w-page gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <a href={item.href} className="inline-flex min-h-11 items-center gap-1.5 t-ui font-semibold text-ink hover:text-ink-2 focus-visible:outline-offset-[-2px] md:min-h-12">
              {item.label}
              {item.count !== null ? <span className="t-meta tabular-nums">{item.count}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type StoreAbout = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  region: string | null;
  is_verified: boolean;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  store_photos: ListingPhotoData[];
};

// A store that is not active has not been approved: the preview must not say it was.
const PREVIEW_VERIFICATION = "Laria aún no aprueba esta tienda. Cuando la apruebe, aquí dirá lo que revisó.";

const SOCIALS = [
  ["instagram_url", "Instagram"],
  ["facebook_url", "Facebook"],
  ["tiktok_url", "TikTok"],
  ["website_url", "Sitio web"],
] as const;

// "Sobre la tienda" (UX-4 L18 A): place, the social links the store gave (http(s) only, opening outside), store
// photos, the verification line and "Reportar tienda". list-12: the street address with "Cómo llegar" only when the
// store agreed to show it (`location` comes from publicStoreLocation), and the opening hours it wrote. Never the contact
// person. The owner's preview (shop-04) leaves "Reportar tienda" out.
export function StoreAboutSection({
  store,
  location,
  preview = false,
  className,
}: {
  store: StoreAbout;
  location?: PublicStoreLocation;
  preview?: boolean;
  className?: string;
}) {
  const place = [store.district, store.city, store.region].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(", ");
  const socials = SOCIALS.flatMap(([key, label]) => {
    const href = safeExternalUrl(store[key]);
    return href ? [{ label, href }] : [];
  });
  return (
    <section id="sobre-la-tienda" aria-labelledby="sobre-la-tienda-titulo" className={className}>
      <h2 id="sobre-la-tienda-titulo" className="t-section text-ink">Sobre la tienda</h2>
      <dl className="mt-3 grid gap-4">
        <AboutRow label="Ubicación">{place}</AboutRow>
        {location?.address ? (
          <AboutRow label="Dirección">
            <span className="break-words">{location.address}</span>
            {location.mapsHref ? (
              <span className="mt-1 block">
                <MapsLink href={location.mapsHref} />
              </span>
            ) : null}
          </AboutRow>
        ) : null}
        {location?.hours ? (
          <AboutRow label="Horario de atención">
            <span className="whitespace-pre-line break-words">{location.hours}</span>
          </AboutRow>
        ) : null}
        {socials.length ? (
          <AboutRow label="Redes">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {socials.map((social) => (
                <li key={social.label}>
                  <a href={social.href} target="_blank" rel="noopener noreferrer nofollow" className="link font-semibold">
                    {social.label}
                    <span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                </li>
              ))}
            </ul>
          </AboutRow>
        ) : null}
        {store.store_photos.length ? (
          <AboutRow label="Fotos del local">
            <StorePhotos photos={store.store_photos} storeName={store.name} />
          </AboutRow>
        ) : null}
        <AboutRow label="Verificación">
          {preview ? PREVIEW_VERIFICATION : store.is_verified ? TRUST_COPY.verifiedStore : TRUST_COPY.approvedStore}
        </AboutRow>
      </dl>
      {preview ? null : (
        <div className="mt-5">
          <ContentReport targetType="store" targetId={store.id} label="Reportar tienda" icon />
        </div>
      )}
    </section>
  );
}

function AboutRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="t-meta">{label}</dt>
      <dd className="t-ui text-ink">{children}</dd>
    </div>
  );
}
