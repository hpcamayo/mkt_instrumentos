import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { getAccountContext } from "@/lib/account-context";
import { listingStatusLabel } from "@/lib/account-ui";
import { isSellerProfileComplete } from "@/lib/auth/profile";
import { buildPendientes, parsePendientes, storeChecklist, type ChecklistStep } from "@/lib/pendientes";
import { assistedCommerceEnabled } from "@/lib/payment-methods";
import { PendientesList } from "@/components/pendientes-list";
import { VacationMode } from "@/components/vacation-mode";
import { buttonClasses } from "@/components/ui/button";
import { Notice, NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getStoreListingQuota } from "@/lib/store-allowance";
import { storeStatusEntry } from "@/lib/ui/status";

export const metadata = { title: "Mi cuenta" };

type Store = Awaited<ReturnType<typeof getAccountContext>>["store"];

// big-09: the account home opens on Pendientes, what needs the person now, instead of metrics. Metrics live in
// Estadísticas (one link away). A failed read says so rather than showing an empty, falsely calm list.
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; password?: string; welcome?: string }>;
}) {
  const status = await searchParams;
  const { user, profile, store, supabase } = await getAccountContext();
  const pendientesRead = supabase ? await supabase.rpc("get_account_pendientes") : { data: null, error: null };
  const pendientes = parsePendientes(pendientesRead.data);
  const items = pendientes ? buildPendientes(pendientes) : [];
  const pausedUntil = pendientes?.seller.paused_until ?? null;

  if (profile?.account_type === "store_owner") {
    const { data: inventory } = store && supabase
      ? await supabase.from("listings").select("id,status").eq("store_id", store.id)
      : { data: [] };
    const concurrent = (inventory ?? []).filter((item) => item.status === "pending" || item.status === "approved").length;
    const quota = await getStoreListingQuota(store ? supabase : null, concurrent);
    const checklist = storeChecklist(store, {
      listings: pendientes?.store?.listings ?? (inventory ?? []).length,
      paymentMethods: pendientes?.store?.payment_methods ?? 0,
      payments: assistedCommerceEnabled(),
    });
    return (
      <div className="space-y-5">
        <AccountNotices confirmed={status.confirmed === "1"} welcomed={false} passwordUpdated={false} storeOwner />
        <section className="surface-frame rounded-panel bg-frame p-5 text-white sm:p-6">
          <p className="t-micro text-muted-dark">Resumen de Tienda</p>
          <h1 className="mt-2 t-page">{store?.name ?? "Completa la solicitud de tu tienda"}</h1>
          <p className="mt-2 t-ui text-muted-dark">{storeTrustLabel(store)} · {concurrent} de {quota.allowance} publicaciones activas o en revisión</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/mi-cuenta/tienda" className={buttonClasses()}>{store ? "Administrar mi tienda" : "Iniciar solicitud"}</Link>
            {store ? <Link href="/mi-cuenta/tienda/inventario" className={buttonClasses({ variant: "onDark" })}>Ver inventario</Link> : null}
            {store ? <Link href="/mi-cuenta/tienda/estadisticas" className={buttonClasses({ variant: "onDark" })}>Estadísticas</Link> : null}
          </div>
        </section>
        {store?.status === "rejected" ? <Notice tone="danger" role="note"><h2 className="font-semibold">Solicitud rechazada</h2><p className="mt-1">{store.rejection_reason || "La solicitud necesita correcciones antes de volver a revisión."}</p><Link href="/mi-cuenta/tienda" className="mt-3 inline-flex">Corregir y reenviar</Link></Notice> : null}
        {concurrent >= quota.allowance ? <Notice tone="warning" role="note"><h2 className="font-semibold">Límite de publicaciones alcanzado</h2><p className="mt-1">Las {quota.allowance} posiciones están ocupadas. Marca como vendidas o archiva las que ya no tienes.</p></Notice> : null}
        {checklist.some((step) => !step.done) ? <StoreChecklist steps={checklist} /> : null}
        <PendientesBlock failed={!pendientes} items={items} title="Hoy en tu tienda" emptyTitle="Todo al día en tu tienda" />
        {store ? <VacationMode pausedUntil={pausedUntil} /> : null}
        {store?.status === "active" ? <p className="t-ui"><Link href={`/tiendas/${store.slug}`} className="link inline-flex items-center gap-2 font-semibold">Ver tienda pública <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link></p> : null}
      </div>
    );
  }

  const { data: listings } = supabase
    ? await supabase
        .from("listings")
        .select("id,title,status,slug,price_pen,created_at")
        .eq("owner_user_id", user.id)
        .is("store_id", null)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  return (
    <div className="space-y-5">
      <AccountNotices confirmed={status.confirmed === "1"} welcomed={status.welcome === "1"} passwordUpdated={status.password === "updated"} storeOwner={false} />
      {!isSellerProfileComplete(profile) ? (
        <section className={noticeClassName("warning")}>
          <NoticeIcon tone="warning" />
          <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-semibold">Completa tu perfil Particular</h2><p className="mt-1 leading-6">Revisa tu nombre, WhatsApp y ubicación antes de publicar.</p></div>
            <Link href="/mi-cuenta/perfil" className={buttonClasses({ variant: "secondary" })}>Completar perfil</Link>
          </div>
        </section>
      ) : null}

      <PageHeader
        className="rounded-panel border border-subtle bg-white p-5 sm:p-6"
        eyebrow="Resumen Particular"
        title={`Hola, ${profile?.full_name || user.email || "bienvenido"}`}
        meta={<nav aria-label="Accesos rápidos" className="flex flex-wrap gap-x-4 gap-y-2"><Link href="/mi-cuenta/publicaciones" className="link font-semibold">Mis publicaciones</Link><Link href="/mi-cuenta/transacciones" className="link font-semibold">Compras y ventas</Link><Link href="/mi-cuenta/favoritos" className="link font-semibold">Favoritos</Link><Link href="/mi-cuenta/estadisticas" className="link font-semibold">Estadísticas</Link></nav>}
        actions={<Link href="/mi-cuenta/publicar" className={buttonClasses()}>Publicar instrumento</Link>}
      />

      <PendientesBlock failed={!pendientes} items={items} title="Pendientes" emptyTitle="Estás al día" />

      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="t-micro text-ink-2">Publicaciones recientes</p><h2 className="mt-1 t-section text-ink">Mis publicaciones</h2></div><Link href="/mi-cuenta/publicaciones" className="link font-semibold">Ver todas</Link></div>
        {listings?.length ? <ul className="mt-4 divide-y divide-subtle">{listings.map((listing) => <li key={listing.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="font-semibold text-ink">{listing.title}</span><span className="text-ink-2">{listingStatusLabel(listing.status)}</span></li>)}</ul> : <p className="mt-4 text-sm text-ink-2">Aún no tienes publicaciones. Crea la primera desde Publicar.</p>}
      </section>

      {listings?.length ? <VacationMode pausedUntil={pausedUntil} /> : null}
    </div>
  );
}

function PendientesBlock({ failed, items, title, emptyTitle }: { failed: boolean; items: ReturnType<typeof buildPendientes>; title: string; emptyTitle: string }) {
  if (failed) return <Notice tone="warning" role="note" title="No pudimos cargar tus pendientes"><p className="mt-1">Recarga la página en un momento. Mientras tanto, todo sigue disponible desde el menú.</p></Notice>;
  return <PendientesList items={items} title={title} emptyTitle={emptyTitle} />;
}

// shop-02: the steps to get the store live, ticked from the store's own data. Gone once every step is done.
function StoreChecklist({ steps }: { steps: ChecklistStep[] }) {
  const done = steps.filter((step) => step.done).length;
  return (
    <section aria-labelledby="checklist-titulo" className="rounded-panel border border-subtle bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="checklist-titulo" className="t-section text-ink">Deja tu tienda lista</h2>
        <p className="t-meta">{done} de {steps.length} pasos</p>
      </div>
      <ol className="mt-3 grid gap-2">
        {steps.map((step) => {
          const Icon = step.done ? CheckCircle2 : Circle;
          return (
            <li key={step.key} className="flex items-start gap-3">
              <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" />
              <div className="min-w-0">
                {step.done ? <p className="t-ui text-ink-2"><span className="sr-only">Hecho: </span>{step.label}</p> : <Link href={step.href} className="link t-ui font-semibold">{step.label}</Link>}
                {step.hint ? <p className="t-meta">{step.hint}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function AccountNotices({ confirmed, welcomed, passwordUpdated, storeOwner }: { confirmed: boolean; welcomed: boolean; passwordUpdated: boolean; storeOwner: boolean }) {
  if (!confirmed && !welcomed && !passwordUpdated) return null;
  return <Notice tone="success" title={passwordUpdated ? "Contraseña actualizada" : confirmed ? "Correo confirmado" : "Cuenta creada"}><p className="mt-1 leading-6">{passwordUpdated ? "Tu contraseña se actualizó correctamente." : storeOwner ? "Tu cuenta de Tienda está activa." : "Tu cuenta Particular está activa para comprar y vender."}</p></Notice>;
}

function storeTrustLabel(store: Store) {
  return store ? storeStatusEntry(store.status, store.is_verified).label : "Sin solicitud";
}
