import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ImageOff } from "lucide-react";
import { SpecStrip, SpecTable } from "@/components/listing/spec-table";
import { buttonClasses } from "@/components/ui/button";
import { NoticeIcon, noticeBodyClassName, noticeClassName } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { StatusTag, Tag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { getSpecStrip, getSpecTable } from "@/lib/listing-specs";
import { getConditionLabel, getListingSecondaryTitle } from "@/lib/listings";
import { isPrivatePhoto } from "@/lib/my-listings";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const metadata: Metadata = { title: "Vista previa de la publicación", robots: NOINDEX_ROBOTS };

type Photo = { image_url: string; alt_text: string | null; sort_order: number };

// mine-06: how the listing will read in public (photos, title, price, condition, specifications and description), for
// its owner only. Another account, or a listing that does not exist, gets the 404; nothing here is public or indexed.
export default async function ListingPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await getAccountContext();
  if (!supabase) redirect("/mi-cuenta");

  const { data: listing } = await supabase
    .from("listings")
    .select("id,title,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,description,owner_user_id,store_id,hidden_source,listing_photos(image_url,alt_text,sort_order)")
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!listing || listing.owner_user_id !== user.id) notFound();

  // Changes in review are what the listing will show once approved, as on the edit page.
  const { data: revision } = await supabase
    .from("listing_revisions")
    .select("changed_fields,title,category,instrument_type,attributes,brand,model,condition,listing_revision_photos(image_url,alt_text,sort_order)")
    .eq("listing_id", listing.id)
    .eq("status", "pending")
    .maybeSingle();
  const changed = new Set(revision?.changed_fields ?? []);
  const pick = <K extends "title" | "category" | "instrument_type" | "attributes" | "brand" | "model" | "condition">(key: K) =>
    revision && changed.has(key) ? (revision[key] ?? listing[key]) : listing[key];
  const shown = {
    title: pick("title") as string,
    category: pick("category") as string,
    instrument_type: pick("instrument_type"),
    attributes: pick("attributes"),
    brand: pick("brand"),
    model: pick("model"),
    condition: pick("condition"),
  };
  const photos: Photo[] = [...((revision && changed.has("photos") ? revision.listing_revision_photos : listing.listing_photos) ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order);
  const secondaryTitle = getListingSecondaryTitle(shown);
  const specsSource = { ...shown, attributes: shown.attributes as Parameters<typeof getSpecTable>[0]["attributes"] };
  const backHref = listing.store_id ? "/mi-cuenta/tienda/inventario?vista=publicaciones" : "/mi-cuenta/publicaciones";
  const canEdit = !["sold", "archived"].includes(listing.status) && !(listing.status === "hidden" && listing.hidden_source === "admin");

  return (
    <section className="grid gap-6">
      <div role="note" className={noticeClassName("info", "flex-wrap items-center")}>
        <NoticeIcon tone="info" />
        <div className={noticeBodyClassName}>
          <p className="font-semibold">Vista previa: así se verá tu publicación. Solo tú la ves.</p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            Estado actual: <StatusTag domain="listing" status={listing.status} />
            {revision ? <StatusTag domain="revision" status="pending" /> : null}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {canEdit ? <Link href={`/mi-cuenta/publicaciones/${listing.id}/editar`} className={buttonClasses({ size: "sm" })}>Editar</Link> : null}
          <Link href={backHref} className={buttonClasses({ variant: "secondary", size: "sm" })}>Volver a mis publicaciones</Link>
        </div>
      </div>

      <article className="flex min-w-0 flex-col gap-6 rounded-panel border border-subtle bg-white p-4 md:p-6 lg:grid lg:grid-cols-12 lg:gap-x-8">
        <div className="min-w-0 lg:col-span-7">
          <PreviewPhotos photos={photos} title={shown.title} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <div>
            <h1 className="t-page text-ink">{shown.title}</h1>
            {secondaryTitle ? <p className="mt-1 t-ui text-ink-2">{secondaryTitle}</p> : null}
            <p className="mt-3"><Price value={listing.price_pen} size="detail" /></p>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              {shown.condition ? <Tag>{getConditionLabel(shown.condition)}</Tag> : null}
              <span className="t-meta">{listing.city}, {listing.region}</span>
            </p>
          </div>
          <SpecStrip specs={getSpecStrip(specsSource)} />
        </div>
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-7">
          <SpecTable specs={getSpecTable(specsSource)} className="min-w-0" />
          <section aria-labelledby="descripcion" className="min-w-0">
            <h2 id="descripcion" className="t-section text-ink">Descripción</h2>
            {listing.description ? (
              <p className="mt-3 max-w-[68ch] whitespace-pre-line break-words t-body text-ink">{listing.description}</p>
            ) : (
              <p className="mt-3 t-body text-ink-2">Esta publicación aún no tiene descripción.</p>
            )}
          </section>
        </div>
      </article>
    </section>
  );
}

// Read-only photos: the first one large (4:3, contained on white) and the rest as thumbnails. Private uploads are
// served by the app with the owner's session, so they skip the optimizer.
function PreviewPhotos({ photos, title }: { photos: Photo[]; title: string }) {
  if (!photos.length) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-panel border border-subtle bg-canvas text-ink-2">
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="t-ui">Sin foto</span>
      </div>
    );
  }
  const [main, ...rest] = photos;
  return (
    <div className="grid gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-panel border border-subtle bg-white">
        <Image src={main.image_url} alt={main.alt_text || `${title}, foto 1`} fill sizes="(max-width: 1023px) 100vw, 58vw" priority unoptimized={isPrivatePhoto(main.image_url)} className="object-contain" />
      </div>
      {rest.length ? (
        <ul aria-label="Más fotos" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {rest.map((photo, index) => (
            <li key={photo.image_url} className="relative aspect-square overflow-hidden rounded-control border border-subtle bg-canvas">
              <Image src={photo.image_url} alt={photo.alt_text || `${title}, foto ${index + 2}`} fill sizes="(max-width: 639px) 25vw, 120px" unoptimized={isPrivatePhoto(photo.image_url)} className="object-cover" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
