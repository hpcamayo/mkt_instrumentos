import Link from "next/link";
import { CreateSearchAlert } from "@/components/create-search-alert";
import { JsonLd } from "@/components/json-ld";
import { ListingCard } from "@/components/listing-card";
import { ListingFilters } from "@/components/listing-filters";
import { SearchTelemetry } from "@/components/marketplace-telemetry";
import { PageContainer } from "@/components/page-container";
import { Pagination } from "@/components/pagination";
import { categoryLandingPages, categoryTypePath, type CategoryLandingPage } from "@/lib/category-pages";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import type { ListingCardData, ListingFilters as ListingFiltersType } from "@/lib/listings";
import { LISTINGS_PAGE_SIZE } from "@/lib/pagination";
import { listingFiltersToSearchAlert, searchAlertPath } from "@/lib/search-alerts";
import { absoluteUrl } from "@/lib/site";

// Crawlable category landing page backed by the real public catalog query.
export function CategoryLanding({
  landing,
  filters,
  listings,
  totalCount,
  page,
  errorMessage,
  searchReceipt,
  searchSignature,
}: {
  landing: CategoryLandingPage;
  filters: ListingFiltersType;
  listings: ListingCardData[];
  totalCount: number;
  page: number;
  errorMessage?: string;
  searchReceipt: string | null;
  searchSignature: string;
}) {
  const path = `/instrumentos/${landing.slug}`;
  const types = getInstrumentTypeOptions(landing.category).filter((type) => type.value !== "other");
  const otherCategories = categoryLandingPages.filter((item) => item.slug !== landing.slug);
  const pages = Math.max(1, Math.ceil(totalCount / LISTINGS_PAGE_SIZE));
  const alertFilters = listingFiltersToSearchAlert(filters);
  const catalogHref = searchAlertPath(alertFilters);

  return (
    <>
      {searchReceipt ? <SearchTelemetry searchReceipt={searchReceipt} signature={searchSignature} filtered /> : null}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Listados", item: absoluteUrl("/listados") },
            { "@type": "ListItem", position: 3, name: landing.label, item: absoluteUrl(path) },
          ],
        }}
      />
      {listings.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: landing.heading,
            numberOfItems: listings.length,
            itemListElement: listings.map((listing, index) => ({
              "@type": "ListItem",
              position: (page - 1) * LISTINGS_PAGE_SIZE + index + 1,
              url: absoluteUrl(`/instrumentos/${listing.slug}`),
              name: listing.title,
            })),
          }}
        />
      ) : null}
      <section className="bg-laria-cloud/70">
        <PageContainer className="flex flex-col gap-6 py-6 sm:gap-7 sm:py-8">
          <div className="rounded-lg border border-laria-fog bg-white p-4 shadow-[0_18px_48px_rgb(16_18_23/0.06)] sm:p-6">
            <nav aria-label="Ruta de navegación" className="text-xs font-bold text-laria-text-soft">
              <ol className="flex flex-wrap items-center gap-1">
                <li><Link href="/" className="hover:text-laria-blue">Inicio</Link></li>
                <li aria-hidden="true">/</li>
                <li><Link href="/listados" className="hover:text-laria-blue">Listados</Link></li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-laria-ink">{landing.label}</li>
              </ol>
            </nav>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">Categoría</p>
                <h1 className="mt-2 text-3xl font-black leading-tight text-laria-ink sm:text-4xl">{landing.heading}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-laria-text-soft sm:text-base">{landing.intro}</p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-laria-fog bg-laria-cloud px-4 py-2 text-sm font-bold text-laria-ink">
                <span className="h-2 w-2 rounded-full bg-laria-blue" />
                {totalCount} resultado{totalCount === 1 ? "" : "s"}
              </div>
            </div>
            {types.length > 1 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-[0.15em] text-laria-text-soft">Tipos</span>
                {types.map((type) => (
                  <Link
                    key={type.value}
                    href={categoryTypePath(landing.category, type.value)}
                    className="inline-flex min-h-9 items-center rounded-full border border-laria-fog bg-white px-3 py-1.5 text-xs font-bold text-laria-ink hover:border-laria-blue hover:text-laria-blue"
                  >
                    {type.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-5 lg:grid-cols-[286px_minmax(0,1fr)] lg:items-start xl:gap-6">
            <ListingFilters filters={filters} />

            <div className="grid min-w-0 gap-4">
              <CreateSearchAlert filters={alertFilters} />

              {errorMessage ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
                  No se pudieron cargar las publicaciones. Intenta nuevamente en unos minutos.
                </div>
              ) : null}

              {!errorMessage && listings.length === 0 ? (
                <div className="rounded-lg border border-laria-fog bg-white p-8 text-center text-sm leading-6 text-laria-text-soft shadow-[0_18px_48px_rgb(16_18_23/0.06)]">
                  <p className="text-lg font-black text-laria-ink">Aún no hay publicaciones de {landing.label.toLowerCase()}</p>
                  <p className="mx-auto mt-2 max-w-md">
                    Crea una alerta para enterarte cuando aparezca una nueva publicación, o revisa el resto del catálogo.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Link href="/listados" className="laria-button-primary min-h-11 px-5 py-3 text-sm">Ver todo el catálogo</Link>
                    <Link href="/vender" className="laria-button-secondary min-h-11 px-5 py-3 text-sm">Publicar un instrumento</Link>
                  </div>
                </div>
              ) : null}

              {listings.length > 0 ? (
                <div className="grid grid-cols-1 gap-[18px] min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 2xl:gap-6">
                  {listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              ) : null}

              {!errorMessage ? <Pagination page={page} total={totalCount} path={path} /> : null}

              {!errorMessage && pages > 1 ? (
                <p className="text-center text-xs text-laria-text-soft">
                  ¿Buscas algo más específico? <Link href={catalogHref} className="font-bold text-laria-blue">Filtra {landing.label.toLowerCase()} por marca, precio o ubicación</Link>.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-laria-fog bg-white p-4 text-sm shadow-sm sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <h2 className="text-base font-black text-laria-ink">Otras categorías</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {otherCategories.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/instrumentos/${item.slug}`} className="inline-flex min-h-9 items-center rounded-full border border-laria-fog px-3 py-1.5 text-xs font-bold text-laria-ink hover:border-laria-blue hover:text-laria-blue">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-laria-text-soft">
              <h2 className="text-base font-black text-laria-ink">Compra con cuidado</h2>
              <p className="mt-2 leading-6">
                Coordinas directamente con cada vendedor por WhatsApp. Laria no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza la transacción.{" "}
                <Link href="/consejos-de-seguridad" className="font-bold text-laria-blue">Lee los consejos de seguridad</Link>.
              </p>
            </div>
          </div>
        </PageContainer>
      </section>
    </>
  );
}
