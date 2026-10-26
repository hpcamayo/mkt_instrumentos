import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListingEditForm, type EditRejection } from "@/components/listing-edit-form";
import { ListingMakerFields } from "@/components/discovery/listing-maker-fields";
import { parseRejectionCodes } from "@/lib/rejection-reasons";
import { returnLabel } from "@/lib/listing-return";
import { getAccountContext } from "@/lib/account-context";
import { SALE_TERMS_COLUMNS } from "@/lib/sale-terms";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Editar publicación" };

export default async function ListingEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string }>;
}) {
  const { id } = await params;
  const { user, profile, store, supabase } = await getAccountContext();
  if (!supabase) redirect("/mi-cuenta");

  const { data: listing } = await supabase
    .from("listings")
    .select(
      `id,title,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,description,owner_user_id,store_id,hidden_source,updated_at,rejection_reason,rejection_codes,${SALE_TERMS_COLUMNS},listing_photos(id,image_url,alt_text,sort_order)`,
    )
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!listing) notFound();

  const returnHref = listing.store_id
    ? "/mi-cuenta/tienda/inventario"
    : "/mi-cuenta/publicaciones";
  if (
    listing.status === "sold" ||
    listing.status === "archived" ||
    (listing.status === "hidden" && listing.hidden_source === "admin") ||
    (profile?.account_type === "store_owner" && listing.store_id !== store?.id) ||
    (profile?.account_type !== "store_owner" && listing.store_id !== null)
  ) {
    return (
      <section className="rounded-panel border border-subtle bg-white p-6">
        <PageHeader
          title="Esta publicación no se puede editar"
          meta="Las publicaciones vendidas son historial inmutable. Las ocultadas por moderación solo pueden restaurarse desde administración."
        />
        <Link href={returnHref} className={buttonClasses({ variant: "secondary", className: "mt-5" })}>{returnLabel(returnHref)}</Link>
      </section>
    );
  }

  const { data: pendingRevision } = await supabase
    .from("listing_revisions")
    .select("id,version,changed_fields,title,category,instrument_type,attributes,brand,model,condition,listing_revision_photos(id,image_url,alt_text,sort_order)")
    .eq("listing_id", listing.id)
    .eq("status", "pending")
    .maybeSingle();

  // mine-01: open on what the moderator asked to fix. A rejected listing has its reason on the row; for a published
  // listing, the latest revision counts only while no newer one is pending.
  const { data: lastRevision } = !pendingRevision && (listing.status === "approved" || listing.status === "hidden")
    ? await supabase.from("listing_revisions").select("status,rejection_reason,rejection_codes").eq("listing_id", listing.id).order("submitted_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const rejection: EditRejection | null = listing.status === "rejected"
    ? { kind: "listing", reason: listing.rejection_reason, codes: parseRejectionCodes(listing.rejection_codes) }
    : lastRevision?.status === "rejected"
      ? { kind: "revision", reason: lastRevision.rejection_reason, codes: parseRejectionCodes(lastRevision.rejection_codes) }
      : null;

  const proposedFields = new Set(pendingRevision?.changed_fields ?? []);
  const { guardado } = await searchParams;
  const notices: Record<string, string> = {
    revision: "Los cambios inmediatos ya se aplicaron. Los cambios principales quedaron en revisión y la versión pública anterior sigue visible.",
    revision_amended: "Actualizamos tus cambios en revisión con la edición más reciente. La versión pública anterior sigue visible.",
    revision_cancelled: "Cancelamos los cambios en revisión porque ya coinciden con la versión publicada.",
    direct: "Los cambios se guardaron correctamente.",
  };
  const editableListing = pendingRevision
    ? {
        ...listing,
        title: proposedFields.has("title") ? pendingRevision.title ?? listing.title : listing.title,
        category: proposedFields.has("category") ? pendingRevision.category ?? listing.category : listing.category,
        instrument_type: proposedFields.has("instrument_type") ? pendingRevision.instrument_type : listing.instrument_type,
        attributes: proposedFields.has("attributes") ? pendingRevision.attributes : listing.attributes,
        brand: proposedFields.has("brand") ? pendingRevision.brand : listing.brand,
        model: proposedFields.has("model") ? pendingRevision.model : listing.model,
        condition: proposedFields.has("condition") ? pendingRevision.condition : listing.condition,
        listing_photos: proposedFields.has("photos")
          ? pendingRevision.listing_revision_photos
          : listing.listing_photos,
      }
    : listing;

  return (
    <section className="grid gap-5">
      <PageHeader eyebrow="Administrar publicación" title={`Editar ${listing.title}`} />
      <ListingEditForm
        key={`${listing.id}:${listing.updated_at}:${pendingRevision?.id ?? "live"}:${pendingRevision?.version ?? 0}`}
        listing={{ ...editableListing, attributes: editableListing.attributes as Record<string, unknown> | null }}
        livePhotos={listing.listing_photos}
        initialNotice={guardado ? notices[guardado] ?? "" : ""}
        hasPendingRevision={Boolean(pendingRevision)}
        isVerifiedStore={Boolean(listing.store_id && store?.status === "active" && store.is_verified)}
        returnHref={returnHref}
        rejection={rejection && (rejection.reason || rejection.codes.length) ? rejection : null}
      />
      {/* discovery batch (disc-04, disc-05): Hecho a mano, a pedido and the artist's note, for makers and artists only */}
      <ListingMakerFields supabase={supabase} listingId={listing.id} />
    </section>
  );
}
