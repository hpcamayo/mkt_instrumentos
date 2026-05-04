import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingDetailMetadata } from "@/components/listing-detail-metadata";
import {
  buildWhatsAppUrl,
  formatPrice,
  getCategoryLabel,
  getSellerTypeLabel,
  normalizeStore,
  type ListingDetailData,
} from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export const dynamic = "force-dynamic";

type ListingDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ListingDetailPage({
  params,
}: ListingDetailPageProps) {
  const { slug } = await params;
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return <SupabaseSetupMessage />;
  }

  const { data, error } = await supabase
    .from("listings")
    .select(
      `
        id,
        title,
        slug,
        description,
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
        contact_name,
        whatsapp_phone,
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
    .eq("status", "approved")
    .eq("slug", slug)
    .order("sort_order", {
      foreignTable: "listing_photos",
      ascending: true,
    })
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  return <ListingDetail listing={data as ListingDetailData} />;
}

function ListingDetail({ listing }: { listing: ListingDetailData }) {
  const store = normalizeStore(listing);
  const sellerName =
    listing.seller_type === "store" ? store?.name : listing.contact_name;
  const photos = listing.listing_photos;

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photos[0].image_url}
              alt={photos[0].alt_text ?? listing.title}
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-sm text-slate-500">
              Foto pendiente
            </div>
          )}
        </div>

        {photos.length > 1 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {photos.slice(1).map((photo) => (
              <div
                key={photo.image_url}
                className="overflow-hidden rounded-md border border-slate-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.image_url}
                  alt={photo.alt_text ?? listing.title}
                  className="aspect-square w-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {getSellerTypeLabel(listing.seller_type)}
            </span>
            {listing.seller_type === "store" && store?.is_verified === true ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Tienda verificada
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 text-2xl font-bold leading-tight text-ink sm:text-3xl">
            {listing.title}
          </h1>
          <p className="mt-3 text-3xl font-bold text-ink">
            {formatPrice(listing.price_pen)}
          </p>
          <ListingDetailMetadata
            listingId={listing.id}
            publishedAt={listing.published_at}
            createdAt={listing.created_at}
            initialViewCount={listing.view_count}
          />

          <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <DetailItem label="Categoría" value={getCategoryLabel(listing.category)} />
            <DetailItem label="Marca" value={listing.brand} />
            <DetailItem label="Modelo" value={listing.model} />
            <DetailItem label="Condición" value={listing.condition} />
            <DetailItem label="Ciudad" value={`${listing.city}, ${listing.region}`} />
            <DetailItem
              label="Vendedor"
              value={sellerName ?? "Vendedor particular"}
            />
          </dl>

          {listing.description ? (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h2 className="text-base font-semibold text-ink">Descripción</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                {listing.description}
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            <a
              href={buildWhatsAppUrl(listing)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Preguntar por WhatsApp
            </a>
            {listing.seller_type === "store" && store ? (
              <Link
                href={`/tiendas/${store.slug}`}
                className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
              >
                Ver página de la tienda
              </Link>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <h2 className="font-semibold">Compra segura, trato directo</h2>
          <p className="mt-1">
            Coordina por WhatsApp, revisa el instrumento en persona cuando sea
            posible y evita adelantos si no conoces al vendedor. Instrumentos
            Perú no procesa pagos, envíos ni garantías.
          </p>
        </div>
      </div>
    </section>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-md bg-mist p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-ink">{value || "No indicado"}</dd>
    </div>
  );
}

function SupabaseSetupMessage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <h1 className="text-xl font-bold text-ink">
          Configura Supabase para ver este instrumento
        </h1>
        <p className="mt-2">
          Falta definir `NEXT_PUBLIC_SUPABASE_URL` y
          `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`. Agrega las
          credenciales públicas y reinicia el servidor de desarrollo.
        </p>
      </div>
    </section>
  );
}
