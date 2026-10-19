import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PickupHoursForm, PurchaseRequestList, ReadyReplies, type PurchaseRequestRow } from "@/components/payment/purchase-requests";
import { ChipLink } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { assistedCommerceEnabled, isPaymentMethod, readyReplies, type ReplyMethod } from "@/lib/payment-methods";
import { getInventorySummary, inventoryDb } from "@/lib/store-inventory";

export const metadata = { title: "Solicitudes de compra" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Effortless Laria, inventory batch, stock-04 and stock-05 (docs/ux-effortless/inventory.md). Purchase requests exist
// only in the assisted-commerce pilot, so the page does too.
export default async function PurchaseRequestsPage({ searchParams }: { searchParams?: SearchParams }) {
  if (!assistedCommerceEnabled()) notFound();
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const params = (await searchParams) ?? {};
  const all = params.ver === "todas";
  const db = inventoryDb(supabase);

  const [requestsResult, storeResult, methodsResult, summary] = await Promise.all([
    db.rpc("get_store_purchase_requests", { p_status: all ? "all" : "waiting", p_limit: 100 }),
    supabase.from("stores").select("name,address,district,city").eq("id", store.id).maybeSingle(),
    supabase.from("store_payment_methods").select("method,status,holder_name,provider_label").eq("store_id", store.id).eq("status", "approved"),
    getInventorySummary(supabase),
  ]);
  const data = requestsResult.data as { waiting: number; requests: PurchaseRequestRow[] } | null;
  const methods: ReplyMethod[] = (methodsResult.data ?? [])
    .filter((row) => isPaymentMethod(row.method))
    .map((row) => ({ method: row.method as ReplyMethod["method"], provider_label: row.provider_label ?? null, holder_name: row.holder_name ?? null }));
  const hours = summary?.preferences?.pickup_hours ?? null;
  const replies = readyReplies({
    name: storeResult.data?.name ?? store.name,
    address: storeResult.data?.address ?? null,
    district: storeResult.data?.district ?? null,
    city: storeResult.data?.city ?? null,
    pickup_hours: hours,
  }, methods);
  const canWrite = store.status === "pending" || store.status === "active";

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Mi tienda"
        title="Solicitudes de compra"
        meta={<p className="max-w-[68ch]">Compradores que tocaron «Solicitar compra» en tus publicaciones. La conversación sigue en tu WhatsApp; aquí anotas cómo terminó.</p>}
      />
      <section aria-labelledby="solicitudes-lista" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="solicitudes-lista" className="t-section text-ink">{all ? "Últimos 60 días" : `Por atender${data ? ` (${data.waiting})` : ""}`}</h2>
          <nav aria-label="Filtrar solicitudes" className="flex gap-2">
            <ChipLink href="/mi-cuenta/tienda/solicitudes" selected={!all} current="page">Por atender</ChipLink>
            <ChipLink href="/mi-cuenta/tienda/solicitudes?ver=todas" selected={all} current="page">Todas</ChipLink>
          </nav>
        </div>
        {requestsResult.error || !data ? (
          <Notice tone="danger" role="alert">No pudimos cargar las solicitudes. Intenta de nuevo en unos minutos.</Notice>
        ) : (
          <PurchaseRequestList requests={data.requests} canWrite={canWrite} />
        )}
        <p className="t-meta">Por atender muestra las solicitudes de los últimos 14 días sin marcar. Laria no guarda montos, pagos ni mensajes.</p>
      </section>

      <section aria-labelledby="respuestas-listas" className="grid gap-3">
        <h2 id="respuestas-listas" className="t-section text-ink">Respuestas listas para WhatsApp</h2>
        <p className="max-w-[68ch] t-body text-ink-2">
          Cópialas y guárdalas en WhatsApp Business como respuestas rápidas (Herramientas para la empresa → Respuestas rápidas) para contestar con un toque. Cambia [equipo] por el nombre del instrumento; el número de Yape o la cuenta los agregas tú en el chat.
        </p>
        {summary?.inventory_enabled && canWrite ? <PickupHoursForm hours={hours} /> : null}
        {methods.length ? null : (
          <Notice tone="info" role="note">Cuando Laria apruebe tus medios de pago, las respuestas los incluirán. <Link href="/mi-cuenta/tienda/pagos" className="link font-semibold">Ir a Pagos</Link></Notice>
        )}
        <ReadyReplies replies={replies} />
      </section>
    </div>
  );
}
