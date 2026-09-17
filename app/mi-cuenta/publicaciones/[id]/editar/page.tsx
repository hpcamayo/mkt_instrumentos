import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListingEditForm } from "@/components/listing-edit-form";
import { getAccountContext } from "@/lib/account-context";

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
      "id,title,status,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,description,owner_user_id,store_id,hidden_source,updated_at,listing_photos(id,image_url,alt_text,sort_order)",
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
      <section className="rounded-lg border border-laria-fog bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-laria-ink">Esta publicación no se puede editar</h1>
        <p className="mt-3 text-sm leading-6 text-laria-text-soft">
          Las publicaciones vendidas son historial inmutable. Las ocultadas por moderación solo pueden restaurarse desde administración.
        </p>
        <Link href={returnHref} className="laria-button-secondary mt-5 min-h-11 px-4 py-3 text-sm">Volver al inventario</Link>
      </section>
    );
  }

  const { data: pendingRevision } = await supabase
    .from("listing_revisions")
    .select("id,version,changed_fields,title,category,instrument_type,attributes,brand,model,condition,listing_revision_photos(id,image_url,alt_text,sort_order)")
    .eq("listing_id", listing.id)
    .eq("status", "pending")
    .maybeSingle();

  const proposedFields = new Set(pendingRevision?.changed_fields ?? []);
  const { guardado } = await searchParams;
  const notices: Record<string, string> = {
    revision: "Los cambios inmediatos ya se aplicaron. Los cambios principales quedaron en revisión y la versión pública anterior sigue visible.",
    revision_amended: "Actualizamos la propuesta pendiente con tus cambios más recientes. La versión pública anterior sigue visible.",
    revision_cancelled: "Cancelamos la propuesta porque ya coincide con la versión pública aprobada.",
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
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-laria-blue">Administrar publicación</p>
        <h1 className="mt-1 text-3xl font-black text-laria-ink">Editar {listing.title}</h1>
      </div>
      <ListingEditForm
        key={`${listing.id}:${listing.updated_at}:${pendingRevision?.id ?? "live"}:${pendingRevision?.version ?? 0}`}
        listing={{ ...editableListing, attributes: editableListing.attributes as Record<string, unknown> | null }}
        livePhotos={listing.listing_photos}
        initialNotice={guardado ? notices[guardado] ?? "" : ""}
        hasPendingRevision={Boolean(pendingRevision)}
        isVerifiedStore={Boolean(listing.store_id && store?.status === "active" && store.is_verified)}
        returnHref={returnHref}
      />
    </section>
  );
}
