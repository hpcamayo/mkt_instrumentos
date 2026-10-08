import Link from "next/link";
import { CatalogView } from "@/components/catalog-view";
import { CreateSearchAlert } from "@/components/create-search-alert";
import { JsonLd } from "@/components/json-ld";
import { SearchTelemetry } from "@/components/marketplace-telemetry";
import { Button } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { categoryLandingPages, categoryTypePath, landingScope, type CategoryLandingPage } from "@/lib/category-pages";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import type { ListingCardData, ListingFilters as ListingFiltersType } from "@/lib/listings";
import { LISTINGS_PAGE_SIZE } from "@/lib/pagination";
import { listingFiltersToSearchAlert } from "@/lib/search-alerts";
import { absoluteUrl } from "@/lib/site";

// Crawlable category landing page backed by the real public catalog query. Same layout and components as the catalog
// (components/catalog-view.tsx) with the category fixed: its filters, sort and pagination lead to
// /listados?category=…, where filtering happens (categoryFilterRedirect); its own pages stay on the landing's path.
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

  return (
    <>
      {searchReceipt ? <SearchTelemetry searchReceipt={searchReceipt} signature={searchSignature} filtered /> : null}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Instrumentos", item: absoluteUrl("/listados") },
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
      <CatalogView
        title={landing.heading}
        breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Instrumentos", href: "/listados" }, { label: landing.label }]}
        lead={landing.intro}
        types={
          types.length > 1 ? (
            <ul aria-label="Tipos" className="mt-4 flex flex-wrap gap-2">
              {types.map((type) => (
                <li key={type.value}>
                  <ChipLink href={categoryTypePath(landing.category, type.value)}>{type.label}</ChipLink>
                </li>
              ))}
            </ul>
          ) : null
        }
        filters={filters}
        scope={landingScope(landing.category)}
        listings={listings}
        totalCount={totalCount}
        page={page}
        path={path}
        error={Boolean(errorMessage)}
        retryHref={page > 1 ? `${path}?page=${page}` : path}
        emptyState={
          <EmptyState
            title={`Aún no hay publicaciones de ${landing.label.toLowerCase()}`}
            description="Crea una alerta para enterarte cuando aparezca una nueva publicación, o revisa el resto del catálogo."
            actions={
              <>
                <CreateSearchAlert filters={listingFiltersToSearchAlert(filters)} variant="inline" />
                <Button href="/listados">Ver todo el catálogo</Button>
                <Button href="/vender" variant="secondary">Publicar un instrumento</Button>
              </>
            }
          />
        }
        after={
          <div className="mt-12 grid gap-8 border-t border-line-deco pt-8 lg:grid-cols-2">
            <section aria-labelledby="otras-categorias">
              <h2 id="otras-categorias" className="t-section text-ink">Otras categorías</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {otherCategories.map((item) => (
                  <li key={item.slug}>
                    <ChipLink href={`/instrumentos/${item.slug}`}>{item.label}</ChipLink>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="compra-con-cuidado" className="t-ui text-ink-2">
              <h2 id="compra-con-cuidado" className="t-section text-ink">Compra con cuidado</h2>
              <p className="mt-2">
                Coordinas directamente con cada vendedor por WhatsApp. Laria no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza la transacción.{" "}
                <Link href="/consejos-de-seguridad" className="link font-semibold">Lee los consejos de seguridad</Link>.
              </p>
            </section>
          </div>
        }
      />
    </>
  );
}
