import Link from "next/link";
import { CircleAlert, MessageCircle, ShieldCheck, Star } from "lucide-react";
import type { ReactNode } from "react";
import { ListingCard } from "@/components/listing-card";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { buttonClasses } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip";
import { VerifiedIcon, VerifiedMark } from "@/components/ui/verified-mark";
import { categoryLandingPath } from "@/lib/category-pages";
import type { HomeStore } from "@/lib/home";
import { categoryOptions, type ListingCardData } from "@/lib/listings";
import { CATALOG_PATH, VERIFIED_STORES_PATH } from "@/lib/shell";
import { HOME_FEED_GRID, HOME_FEED_SIZES } from "@/lib/ui/listing-grid";
import { storeInitials } from "@/lib/ui/initials";
import { cn } from "@/lib/utils";

// The home's sections under the banner (docs/ux-redesign/ux-3-discovery.md § Home, reshaped by Effortless Laria BIG 01):
// the category chips, "Bajaron de precio", "Cómo funciona Laria", "Tiendas verificadas" and the sell block. "Para ti",
// "Nuevo desde tu última visita" and "¿Qué tocas?" are client code (components/home/home-for-you.tsx). Server
// components; only the cards are client code (impressions with source "home", the favourite on feed cards).

const countFormat = new Intl.NumberFormat("es-PE");
export const publicationsLabel = (count: number) => (count === 1 ? "1 publicación" : `${countFormat.format(count)} publicaciones`);
// The catalog link of the vitrina and the phone feed; without the total (its count failed) it names no number.
export const catalogLinkLabel = (total: number | null) =>
  total === null ? "Ver todo el catálogo" : total === 1 ? "Ver la publicación" : `Ver las ${countFormat.format(total)} publicaciones`;

// On phones a section link's hit area grows to 44 px without moving the title line.
const SECTION_LINK = "link relative inline-flex min-h-6 shrink-0 items-center t-ui font-semibold before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] md:before:hidden";

// Title (t-section) with the section's link on the same line, right-aligned (audit item 15), then the subtitle.
function SectionHeader({ id, title, subtitle, link }: { id: string; title: string; subtitle?: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-3 md:mb-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id={id} className="t-section text-ink">{title}</h2>
        {link ? <Link href={link.href} className={SECTION_LINK}>{link.label}</Link> : null}
      </div>
      {subtitle ? <p className="mt-0.5 t-meta">{subtitle}</p> : null}
    </div>
  );
}

// A row that scrolls sideways inside its section on phones and tablets (the stores), where four columns would be too
// narrow for their captions, and is a grid from 1024 px.
const SCROLL_ROW = "scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:gap-5 lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0";

// BIG 01 and FIND 06 (Effortless Laria): the categories as one slim row of chips under the search, each a link to its
// landing (SEO-002) with its count (Q10 B). A category known to have no listings is left out until it has stock; one
// whose count failed still shows, without a number.
export function CategoryTiles({ counts }: { counts: Record<string, number | null> }) {
  const shown = categoryOptions.filter((category) => counts[category.value] !== 0);
  return (
    <nav aria-labelledby="categorias-titulo">
      <h2 id="categorias-titulo" className="sr-only">Categorías</h2>
      <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:flex-wrap md:overflow-visible lg:mx-0 lg:px-0">
        {shown.map((category) => {
          const count = counts[category.value];
          return (
            <li key={category.value} className="shrink-0">
              <ChipLink href={categoryLandingPath(category.value)}>
                {category.label}
                {typeof count === "number" ? (
                  <span className="ml-1.5 font-normal text-ink-2">
                    {countFormat.format(count)}
                    <span className="sr-only"> {count === 1 ? "publicación" : "publicaciones"}</span>
                  </span>
                ) : null}
              </ChipLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// FIND 10: "Bajaron de precio", listings whose price went down in the past 30 days, the latest first, each card with
// its "Antes S/" line. Left out when there are none.
export function PriceDropsSection({ listings }: { listings: ListingCardData[] }) {
  return (
    <section aria-labelledby="bajaron-titulo">
      <SectionHeader
        id="bajaron-titulo"
        title="Bajaron de precio"
        subtitle="Precio más bajo que hace 30 días o menos."
        link={{ href: `${CATALOG_PATH}?sort=price_drop`, label: "Ver todas" }}
      />
      <ul className={HOME_FEED_GRID}>
        {listings.map((listing, index) => (
          <li key={listing.id} className={cn("min-w-0", index >= 4 && "max-md:hidden")}>
            <ListingCard listing={listing} source="home" headingLevel={3} sizes={HOME_FEED_SIZES} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// H4 promises 2–5, each with an 18 px line icon; the verified mark is drawn at the same size (audit item 12).
const PROMISES: { title: string; text: string; icon: ReactNode }[] = [
  { title: "Publicaciones revisadas", text: "Cada publicación la revisa Laria o viene de una tienda verificada.", icon: <ShieldCheck aria-hidden="true" className="h-[18px] w-[18px]" /> },
  { title: "Tiendas verificadas", text: "Antes de darles la insignia, Laria revisa a mano su RUC, dirección y contacto.", icon: <VerifiedIcon className="h-[18px] w-[18px]" /> },
  { title: "Reseñas de compras confirmadas", text: "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria.", icon: <Star aria-hidden="true" className="h-[18px] w-[18px]" /> },
  { title: "Trato directo por WhatsApp", text: "Hablas con quien vende y acuerdan pago y entrega. Laria no cobra comisión.", icon: <MessageCircle aria-hidden="true" className="h-[18px] w-[18px]" /> },
];

// "Cómo funciona Laria" (H4, H5; audit items 8 and 12): the header's "Cómo funciona" lands here (#como-funciona).
export function HowItWorks() {
  const safety = <Link href="/consejos-de-seguridad" className="link inline-flex min-h-6 w-fit items-center t-ui font-semibold">Consejos de seguridad</Link>;
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="rounded-panel bg-canvas p-5 md:p-8">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-10">
        <div className="flex flex-col gap-2">
          <h2 id="como-funciona-titulo" className="t-section text-ink">Cómo funciona Laria</h2>
          <p className="max-w-[44ch] t-ui text-ink-2">Laria conecta a quien compra con quien vende. No procesa pagos ni envíos: eso lo acuerdan ustedes.</p>
          <div className="mt-1 hidden lg:block">{safety}</div>
        </div>
        <div>
          <ul className="grid gap-5 md:grid-cols-2 md:gap-x-8 md:gap-y-6">
            {PROMISES.map((promise) => (
              <li key={promise.title} className="flex gap-3">
                <span className="mt-[3px] flex shrink-0 text-ink">{promise.icon}</span>
                <div>
                  <h3 className="text-[16px] font-semibold leading-6 text-ink">{promise.title}</h3>
                  <p className="t-ui text-ink-2">{promise.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex gap-3 border-t border-line-deco pt-5 t-ui text-ink">
            <CircleAlert aria-hidden="true" className="mt-px h-[18px] w-[18px] shrink-0" />
            <span>Si puedes, revisa el equipo en persona antes de pagar. No adelantes pagos por Yape o Plin a quien no conoces.</span>
          </p>
          <div className="mt-4 lg:hidden">{safety}</div>
        </div>
      </div>
    </section>
  );
}

// Up to three active verified stores, newest first, without stats (Q18 A), and the "¿Tienes una tienda?" tile. "Ver
// todas" opens the catalog filtered to verified stores: there is no stores directory (N7).
export function VerifiedStoresSection({ stores }: { stores: HomeStore[] }) {
  return (
    <section aria-labelledby="tiendas-titulo">
      <SectionHeader id="tiendas-titulo" title="Tiendas verificadas" link={{ href: VERIFIED_STORES_PATH, label: "Ver todas" }} />
      <ul className={cn(SCROLL_ROW, "lg:grid-cols-4")}>
        {stores.map((store) => (
          <li key={store.id} className="flex w-64 shrink-0 lg:w-auto">
            <Link href={`/tiendas/${store.slug}`} className="group flex w-full gap-3 rounded-panel border border-subtle bg-surface p-4 transition-colors duration-120 hover:border-line-strong">
              <StoreMonogram store={store} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate t-card-title text-ink decoration-accent decoration-2 underline-offset-[3px] group-hover:underline">{store.name}</span>
                <span className="truncate t-meta">{[store.district, store.city].filter(Boolean).join(", ")}</span>
                <VerifiedMark className="mt-2" />
              </span>
            </Link>
          </li>
        ))}
        <li className="flex w-64 shrink-0 lg:w-auto">
          <div className="flex w-full flex-col rounded-panel bg-canvas p-4">
            <h3 className="t-card-title text-ink">¿Tienes una tienda?</h3>
            <p className="mt-1 t-ui text-ink-2">Publica tu inventario, recibe consultas por WhatsApp y muestra tu verificación.</p>
            <Link href="/registrar-tienda" className="link mt-3 inline-flex min-h-6 w-fit items-center t-ui font-semibold">Registrar mi tienda</Link>
          </div>
        </li>
      </ul>
    </section>
  );
}

// The store's logo, or white initials on a 40 px frame-2 square (audit item 11). Decorative: the name follows.
function StoreMonogram({ store }: { store: HomeStore }) {
  if (store.logo_url) {
    return <Image src={store.logo_url} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-tag border border-subtle object-cover" />;
  }
  return (
    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-tag bg-frame-2 text-[13px] font-bold text-white">
      {storeInitials(store.name)}
    </span>
  );
}

// H4: "Publicar es gratis. Revisamos tu publicación antes de mostrarla." The page's second yellow action, far from
// the banner's "Explorar" (audit item 9: the canvas fill, no border).
export function SellBlock() {
  return (
    <section aria-labelledby="vender-titulo" className="flex flex-col gap-4 rounded-panel bg-canvas p-5 md:flex-row md:items-center md:justify-between md:gap-8 md:p-8">
      <div>
        <h2 id="vender-titulo" className="t-section text-ink">¿Tienes equipo que ya no usas?</h2>
        <p className="mt-1 t-ui text-ink-2">Publicar es gratis. Revisamos tu publicación antes de mostrarla.</p>
      </div>
      <Link href="/vender" className={buttonClasses({ variant: "primary", size: "lg", className: "max-md:w-full" })}>Vender mi equipo</Link>
    </section>
  );
}
