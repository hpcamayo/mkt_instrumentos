import type { Metadata } from "next";
import { ListingCard } from "@/components/listing-card";
import { ListingFilters } from "@/components/listing-filters";
import {
  parseListingFilters,
  type ListingCardData,
  type ListingFilters as ListingFiltersType,
} from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Listados",
  description:
    "Explora instrumentos musicales aprobados de vendedores particulares y tiendas en Perú.",
  openGraph: {
    title: "Listados de instrumentos musicales en Perú",
    description:
      "Guitarras, bajos, baterías, pedales, amplificadores y equipos de audio con contacto directo por WhatsApp.",
    url: "/listados",
  },
};

type ListingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ListingsPage({ searchParams }: ListingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseListingFilters(resolvedSearchParams);
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return <SupabaseSetupMessage filters={filters} />;
  }

  let query = supabase
    .from("listings")
    .select(
      `
        id,
        title,
        slug,
        category,
        brand,
        model,
        condition,
        price_pen,
        instrument_type,
        attributes,
        published_at,
        view_count,
        city,
        region,
        seller_type,
        created_at,
        stores (
          name,
          slug,
          status,
          is_verified
        ),
        listing_photos (
          image_url,
          alt_text,
          sort_order
        )
      `,
    )
    .eq("status", "approved");

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.city) {
    query = query.eq("city", filters.city);
  }

  if (filters.condition) {
    query = query.eq("condition", filters.condition);
  }

  if (filters.sellerType) {
    query = query.eq("seller_type", filters.sellerType);
  }

  if (filters.minPrice !== undefined) {
    query = query.gte("price_pen", filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    query = query.lte("price_pen", filters.maxPrice);
  }

  if (filters.sort === "price_asc") {
    query = query.order("price_pen", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "price_desc") {
    query = query.order("price_pen", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.order("sort_order", {
    foreignTable: "listing_photos",
    ascending: true,
  });

  const { data, error } = await query;

  return (
    <ListingsView
      filters={filters}
      listings={(data ?? []) as ListingCardData[]}
      errorMessage={error?.message}
    />
  );
}

type ListingsViewProps = {
  filters: ListingFiltersType;
  listings: ListingCardData[];
  errorMessage?: string;
};

function ListingsView({ filters, listings, errorMessage }: ListingsViewProps) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brass">
          Listados
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">
              Instrumentos disponibles
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Explora publicaciones aprobadas de particulares y tiendas. Cuando
              algo te interese, abre el detalle y conversa directo por WhatsApp.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500">
            {listings.length} resultado{listings.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <ListingFilters filters={filters} />

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los listados. Revisa la configuración de
          Supabase e intenta nuevamente.
        </div>
      ) : null}

      {!errorMessage && listings.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600 shadow-sm">
          <p className="font-semibold text-ink">No hay instrumentos con esos filtros.</p>
          <p className="mt-1">
            Prueba limpiar la búsqueda, cambiar la ciudad o revisar otra categoría.
          </p>
        </div>
      ) : null}

      {listings.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SupabaseSetupMessage({ filters }: { filters: ListingFiltersType }) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brass">
          Listados
        </p>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Configura Supabase para ver listados
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          Falta definir `NEXT_PUBLIC_SUPABASE_URL` y
          `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`. Cuando estén listas,
          esta página mostrará solo publicaciones aprobadas.
        </p>
      </div>
      <ListingFilters filters={filters} />
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Copia `.env.example` a `.env.local`, agrega las credenciales públicas de
        Supabase y reinicia el servidor de desarrollo.
      </div>
    </section>
  );
}
