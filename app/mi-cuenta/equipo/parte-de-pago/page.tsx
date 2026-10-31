import Link from "next/link";
import { redirect } from "next/navigation";
import { TradeRequestForm } from "@/components/offers/trade-request-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { GEAR_COLUMNS, sellingDb, type GearItem } from "@/lib/selling-tools";

export const metadata = { title: "Tu equipo como parte de pago" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// run-04: from a store listing that says "Aceptamos tu equipo como parte de pago". Only that store sees the request.
export default async function PartPaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const listingId = typeof params.publicacion === "string" && UUID.test(params.publicacion) ? params.publicacion : null;
  const { user, profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta");
  const db = supabase ? sellingDb(supabase) : null;
  const [listingResult, acceptsResult, gearResult] = db && listingId
    ? await Promise.all([
        db.from("listings").select("id,title,slug,stores(name)").eq("id", listingId).maybeSingle(),
        db.rpc("listing_accepts_part_payment", { p_listing_id: listingId }),
        db.from("gear_items").select(GEAR_COLUMNS).order("created_at", { ascending: false }),
      ])
    : [{ data: null }, { data: false }, { data: null }];
  const listing = listingResult.data as { id: string; title: string; slug: string; stores: { name: string } | { name: string }[] | null } | null;
  const storeName = Array.isArray(listing?.stores) ? listing?.stores[0]?.name : listing?.stores?.name;

  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow={listing ? <Link href={`/instrumentos/${listing.slug}`} className="underline decoration-line-deco underline-offset-[3px]">{listing.title}</Link> : "Mi equipo"}
        title="Tu equipo como parte de pago"
        meta={<p className="max-w-[68ch]">Cuéntale a la tienda qué equipo dejarías. Te responde con un estimado; el valor final lo confirma al revisarlo en la tienda.</p>}
      />
      {listing && acceptsResult.data === true ? (
        <TradeRequestForm
          kind="part_payment"
          userId={user.id}
          gear={(gearResult.data ?? []) as unknown as GearItem[]}
          listing={{ id: listing.id, title: listing.title, storeName: storeName ?? "La tienda" }}
          defaults={{ city: profile?.city ?? "", region: profile?.region ?? "" }}
        />
      ) : (
        <EmptyState
          title="Esta publicación no recibe equipos como parte de pago"
          description="Puede que la tienda haya cambiado la opción o que la publicación ya no esté disponible."
          actions={<Button href="/listados" variant="secondary">Explorar instrumentos</Button>}
        />
      )}
    </section>
  );
}
