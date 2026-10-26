import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConsignmentStorePanel } from "@/components/offers/consignment-store-panel";
import { PartPaymentToggle } from "@/components/offers/part-payment-toggle";
import { PriceStepsPanel } from "@/components/offers/price-steps-panel";
import { PrivateOfferPanel } from "@/components/offers/private-offer-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { StatusTag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import {
  isTradeCategory,
  sellingDb,
  type PriceStepsRule,
  type PrivateOfferAudience,
  type StoreListingConsignment,
  type StoreTradeSettings,
} from "@/lib/selling-tools";

export const metadata = { title: "Herramientas de venta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OwnListing = {
  id: string;
  title: string;
  slug: string;
  status: string;
  price_pen: number | null;
  seller_type: "individual" | "store";
  store_id: string | null;
  category: string;
  accepts_part_payment: boolean | null;
};

// The selling tools of one listing (docs/feature-ideas/selling-tools.md): price steps (sell-04) and the private offer
// (sell-05) for every owner; part payment (run-04) and consignment (sell-03) for store listings; the "¿Prefieres vender
// ya?" path (sell-02) for a Particular's guitar, bass, amp, pedal or keyboard.
export default async function SellingToolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { user, profile, store, supabase } = await getAccountContext();
  if (!supabase) redirect("/mi-cuenta");
  const db = sellingDb(supabase);
  const { data } = await db.from("listings").select("id,title,slug,status,price_pen,seller_type,store_id,category,accepts_part_payment").eq("id", id).eq("owner_user_id", user.id).maybeSingle();
  const listing = data as OwnListing | null;
  if (!listing) notFound();
  const isStore = listing.seller_type === "store" && Boolean(store) && listing.store_id === store?.id;

  const [ruleResult, audienceResult, stockResult, consignmentResult, settingsResult] = await Promise.all([
    db.from("listing_price_steps").select("listing_id,floor_pen,step_percent,interval_days,only_without_contacts,status,finished_reason,start_price_pen,steps_taken,next_step_at,last_step_at").eq("listing_id", id).maybeSingle(),
    db.rpc("get_private_offer_audience", { p_listing_id: id }),
    isStore ? db.from("store_inventory_items").select("id").eq("listing_id", id).limit(1) : Promise.resolve({ data: [] }),
    isStore ? db.rpc("get_store_listing_consignment", { p_listing_id: id }) : Promise.resolve({ data: null }),
    isStore && store ? db.from("store_trade_settings").select("consignment,part_payment").eq("store_id", store.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rule = ruleResult.data as PriceStepsRule | null;
  const audience = audienceResult.data as PrivateOfferAudience | null;
  const stockManaged = Array.isArray(stockResult.data) && stockResult.data.length > 0;
  const settings = settingsResult.data as Pick<StoreTradeSettings, "consignment" | "part_payment"> | null;
  const closed = listing.status === "sold" || listing.status === "archived";
  const stepsUnavailable = closed
    ? "Esta publicación ya no está activa."
    : stockManaged
    ? "El precio de esta publicación sigue al de tu Inventario: cámbialo allí."
    : listing.status !== "approved"
    ? "Disponible cuando la publicación esté en línea."
    : null;
  const back = isStore ? "/mi-cuenta/tienda/inventario?vista=publicaciones" : "/mi-cuenta/publicaciones";

  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow={<Link href={back} className="underline decoration-line-deco underline-offset-[3px]">{isStore ? "Inventario" : "Mis publicaciones"}</Link>}
        title="Herramientas de venta"
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/instrumentos/${listing.slug}`} className="link t-ui font-semibold">{listing.title}</Link>
            <Price value={listing.price_pen} size="inline" />
            <StatusTag domain="listing" status={listing.status} />
          </div>
        }
      />
      <PriceStepsPanel listingId={listing.id} price={listing.price_pen} rule={rule} unavailableReason={stepsUnavailable} />
      <PrivateOfferPanel listingId={listing.id} audience={closed ? null : audience} />
      {isStore && store ? (
        <>
          <section aria-labelledby="parte-de-pago" className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
            <h2 id="parte-de-pago" className="t-section text-ink">Parte de pago</h2>
            <PartPaymentToggle listingId={listing.id} value={listing.accepts_part_payment} storeDefault={settings?.part_payment === true} />
            <Link href="/mi-cuenta/tienda/ofertas" className="link w-fit t-ui">Ver pedidos en Ofertas</Link>
          </section>
          <ConsignmentStorePanel
            listingId={listing.id}
            listingTitle={listing.title}
            storeName={store.name}
            consignment={consignmentResult.data as StoreListingConsignment | null}
            enabled={settings?.consignment === true && store.is_verified === true && !stockManaged && !closed}
          />
        </>
      ) : null}
      {!isStore && profile?.account_type !== "store_owner" && isTradeCategory(listing.category) && !closed ? (
        <section aria-labelledby="vender-ya" className="grid gap-2 rounded-panel border border-subtle bg-surface p-5">
          <h2 id="vender-ya" className="t-section text-ink">¿Prefieres vender ya?</h2>
          <p className="t-ui text-ink-2">Las tiendas verificadas de tu región que compran usados te ofertan en 24 horas. Eliges una, o ninguna, y sigues con tu publicación si quieres.</p>
          <Button href="/mi-cuenta/equipo/ofertas/nueva" variant="secondary" className="w-fit">Pedir ofertas a tiendas</Button>
        </section>
      ) : null}
    </section>
  );
}
