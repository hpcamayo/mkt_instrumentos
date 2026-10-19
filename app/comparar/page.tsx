import type { Metadata } from "next";
import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { PageContainer } from "@/components/page-container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { VerifiedMark } from "@/components/ui/verified-mark";
import { catalogCardSelect } from "@/lib/catalog";
import { compareSlugs } from "@/lib/catalog-compare";
import { getSpecTable } from "@/lib/listing-specs";
import { formatPrice, getConditionLabel, normalizeStore, type ListingCardData } from "@/lib/listings";
import { NOINDEX_FOLLOW_ROBOTS } from "@/lib/site";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comparar instrumentos", robots: NOINDEX_FOLLOW_ROBOTS };

// FIND 12 (Effortless Laria): up to three public listings side by side, with the listing page's spec table
// (lib/listing-specs.ts). The choice comes from the address (?p=slug,slug), made by the tray or the favorites.
type CompareProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };


export default async function ComparePage({ searchParams }: CompareProps) {
  const slugs = compareSlugs((await searchParams).p);
  const supabase = getPublicSupabaseClient();
  const { data } = supabase && slugs.length
    ? await supabase.from("listings").select(catalogCardSelect()).in("slug", slugs).eq("status", "approved").order("sort_order", { foreignTable: "listing_photos", ascending: true }).limit(1, { foreignTable: "listing_photos" }).returns<ListingCardData[]>()
    : { data: [] as ListingCardData[] };
  const listings = slugs.map((slug) => (data ?? []).find((listing) => listing.slug === slug)).filter((listing): listing is ListingCardData => Boolean(listing));

  if (listings.length < 2) {
    return (
      <PageContainer as="section" className="py-8">
        <h1 className="t-page text-ink">Comparar instrumentos</h1>
        <EmptyState
          className="mt-6"
          title="Elige al menos dos publicaciones"
          description="En computadora, marca “Comparar” en las publicaciones del catálogo. En el celular, compara desde tus favoritas."
          actions={<Button href="/listados">Ver instrumentos</Button>}
        />
      </PageContainer>
    );
  }

  const specs = listings.map((listing) => getSpecTable({ ...listing, condition: listing.condition }));
  const labels = [...new Set(specs.flatMap((table) => table.map((spec) => spec.label)))];
  const rows: { label: string; values: string[] }[] = [
    { label: "Precio", values: listings.map((listing) => formatPrice(listing.price_pen)) },
    ...labels.map((label) => ({ label, values: specs.map((table) => table.find((spec) => spec.label === label)?.value ?? "—") })),
    { label: "Ubicación", values: listings.map((listing) => [normalizeStore(listing)?.district, listing.city].filter(Boolean).join(", ")) },
  ];
  const differs = (values: string[]) => new Set(values).size > 1;

  return (
    <PageContainer as="section" className="py-6 lg:py-8">
      <h1 className="t-page text-ink">Comparar instrumentos</h1>
      <p className="mt-2 t-meta">Las filas que cambian entre publicaciones están marcadas con “Distinto”.</p>
      <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-left">
          <caption className="sr-only">Comparación de {listings.length} publicaciones</caption>
          <thead>
            <tr>
              <th scope="col" className="w-32 align-bottom pb-3 t-meta font-semibold md:w-44">Publicación</th>
              {listings.map((listing) => (
                <th key={listing.id} scope="col" className="px-2 pb-3 align-top font-normal md:px-3">
                  <ListingCard listing={listing} headingLevel={3} source="other" sizes="(max-width: 767px) 40vw, 320px" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line-deco">
                <th scope="row" className="py-3 pr-2 align-top t-meta font-semibold">
                  {row.label}
                  {differs(row.values) ? <span className="mt-0.5 block font-normal">Distinto</span> : null}
                </th>
                {row.values.map((value, index) => (
                  <td key={listings[index].id} className="px-2 py-3 align-top t-ui text-ink md:px-3">{row.label === "Condición" && value !== "—" ? getConditionLabel(value) : value}</td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-line-deco">
              <th scope="row" className="py-3 pr-2 align-top t-meta font-semibold">Vendedor</th>
              {listings.map((listing) => {
                const store = normalizeStore(listing);
                return (
                  <td key={listing.id} className="px-2 py-3 align-top t-ui text-ink md:px-3">
                    {listing.seller_type === "store" ? (store?.is_verified ? <VerifiedMark /> : "Tienda") : "Particular"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-6 t-meta">
        Laria no verifica el estado de los instrumentos. Revisa cada publicación y coordina con quien vende.{" "}
        <Link href="/consejos-de-seguridad" className="link font-semibold">Consejos de seguridad</Link>
      </p>
    </PageContainer>
  );
}
