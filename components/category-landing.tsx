import { buttonClasses } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
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
      <section className="bg-canvas/70">
        <PageContainer className="flex flex-col gap-6 py-6 sm:gap-7 sm:py-8">
          <div className="rounded-panel border border-subtle bg-white p-4 sm:p-6">
            <nav aria-label="Ruta de navegación" className="t-meta font-semibold">
              <ol className="flex flex-wrap items-center gap-1">
                <li><Link href="/" className="underline-offset-4 hover:text-ink hover:underline hover:decoration-accent hover:decoration-2">Inicio</Link></li>
                <li aria-hidden="true">/</li>
                <li><Link href="/listados" className="underline-offset-4 hover:text-ink hover:underline hover:decoration-accent hover:decoration-2">Listados</Link></li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-ink">{landing.label}</li>
              </ol>
            </nav>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <PageHeader eyebrow="Categoría" title={landing.heading} />
                <p className="mt-3 max-w-[68ch] t-body text-ink-2">{landing.intro}</p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 t-ui font-semibold text-ink tabular-nums">
                {totalCount} resultado{totalCount === 1 ? "" : "s"}
              </div>
            </div>
            {types.length > 1 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="t-micro text-ink-2">Tipos</span>
                {types.map((type) => (
                  <ChipLink key={type.value} href={categoryTypePath(landing.category, type.value)}>
                    {type.label}
                  </ChipLink>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-5 lg:grid-cols-[286px_minmax(0,1fr)] lg:items-start xl:gap-6">
            <ListingFilters filters={filters} />

            <div className="grid min-w-0 gap-4">
              <CreateSearchAlert filters={alertFilters} />

              {errorMessage ? (
                <Notice tone="danger" role="alert">
                  No se pudieron cargar las publicaciones. Intenta nuevamente en unos minutos.
                </Notice>
              ) : null}

              {!errorMessage && listings.length === 0 ? (
                <EmptyState
                  title={`Aún no hay publicaciones de ${landing.label.toLowerCase()}`}
                  description="Crea una alerta para enterarte cuando aparezca una nueva publicación, o revisa el resto del catálogo."
                  actions={<>
                    <Link href="/listados" className={buttonClasses()}>Ver todo el catálogo</Link>
                    <Link href="/vender" className={buttonClasses({ variant: "secondary" })}>Publicar un instrumento</Link>
                  </>}
                />
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
                <p className="text-center t-meta">
                  ¿Buscas algo más específico? <Link href={catalogHref} className="link font-semibold">Filtra {landing.label.toLowerCase()} por marca, precio o ubicación</Link>.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 rounded-panel border border-subtle bg-white p-4 t-ui sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <h2 className="t-section text-ink">Otras categorías</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {otherCategories.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/instrumentos/${item.slug}`} className="inline-flex min-h-10 items-center rounded-control border border-line-strong bg-white px-3 py-1.5 t-ui font-semibold text-ink transition-colors duration-120 hover:bg-canvas">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-ink-2">
              <h2 className="t-section text-ink">Compra con cuidado</h2>
              <p className="mt-2">
                Coordinas directamente con cada vendedor por WhatsApp. Laria no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza la transacción.{" "}
                <Link href="/consejos-de-seguridad" className="link font-semibold">Lee los consejos de seguridad</Link>.
              </p>
            </div>
          </div>
        </PageContainer>
      </section>
    </>
  );
}
