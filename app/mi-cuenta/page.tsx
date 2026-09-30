import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getAccountContext } from "@/lib/account-context";
import { listingStatusLabel } from "@/lib/account-ui";
import { isSellerProfileComplete } from "@/lib/auth/profile";
import { getAccountAnalytics } from "@/lib/account-analytics";
import { AccountAnalyticsMetrics } from "@/components/account-analytics";
import { buttonClasses } from "@/components/ui/button";
import { Notice, NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { storeStatusEntry } from "@/lib/ui/status";

export const metadata = { title: "Mi cuenta" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; password?: string; welcome?: string }>;
}) {
  const status = await searchParams;
  const { user, profile, store, supabase } = await getAccountContext();

  if (profile?.account_type === "store_owner") {
    const { data: inventory } = store && supabase
      ? await supabase
          .from("listings")
          .select("id,title,status,slug,created_at")
          .eq("store_id", store.id)
          .order("created_at", { ascending: false })
      : { data: [] };
    return <StoreOwnerDashboard email={user.email ?? ""} confirmed={status.confirmed === "1"} store={store} inventory={inventory ?? []} />;
  }

  const [{ data: listings }, analytics] = await Promise.all([supabase
    ? supabase
        .from("listings")
        .select("id,title,status,slug,price_pen,created_at")
        .eq("owner_user_id", user.id)
        .is("store_id", null)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] }, getAccountAnalytics(0)]);

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
        meta={<p className="max-w-[68ch]">Compra y vende desde una sola cuenta. Tus publicaciones siempre quedan vinculadas a este perfil.</p>}
        actions={<Link href="/mi-cuenta/publicar" className={buttonClasses()}>Publicar instrumento</Link>}
      />

      <AccountAnalyticsMetrics analytics={analytics} />

      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="t-micro text-ink-2">Publicaciones recientes</p><h2 className="mt-1 t-section text-ink">Mis publicaciones</h2></div><Link href="/mi-cuenta/publicaciones" className="link font-semibold">Ver todas</Link></div>
        {listings?.length ? <ul className="mt-4 divide-y divide-subtle">{listings.map((listing) => <li key={listing.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="font-semibold text-ink">{listing.title}</span><span className="text-ink-2">{listingStatusLabel(listing.status)}</span></li>)}</ul> : <p className="mt-4 text-sm text-ink-2">Aún no tienes publicaciones. Crea la primera desde Publicar.</p>}
      </section>
    </div>
  );
}

function StoreOwnerDashboard({ email, confirmed, store, inventory }: {
  email: string;
  confirmed: boolean;
  store: Awaited<ReturnType<typeof getAccountContext>>["store"];
  inventory: { id: string; title: string; status: string; slug: string; created_at: string }[];
}) {
  const pending = inventory.filter((item) => item.status === "pending").length;
  const approved = inventory.filter((item) => item.status === "approved").length;
  const concurrent = pending + approved;
  return (
    <div className="space-y-5">
      <AccountNotices confirmed={confirmed} welcomed={false} passwordUpdated={false} storeOwner />
      <section className="surface-frame rounded-panel bg-frame p-5 text-white sm:p-6">
        <p className="t-micro text-muted-dark">Resumen de Tienda</p>
        <h1 className="mt-2 t-page">{store?.name ?? "Completa la solicitud de tu tienda"}</h1>
        <p className="mt-2 t-ui text-muted-dark">{store?.razon_social ?? email}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/mi-cuenta/tienda" className={buttonClasses()}>{store ? "Administrar mi tienda" : "Iniciar solicitud"}</Link>
          {store ? <Link href="/mi-cuenta/tienda/publicar" className={buttonClasses({ variant: "onDark" })}>Publicar</Link> : null}
          {store ? <Link href="/mi-cuenta/tienda/inventario" className={buttonClasses({ variant: "onDark" })}>Ver inventario</Link> : null}
        </div>
      </section>
      {store?.status === "rejected" ? <Notice tone="danger" role="note"><h2 className="font-semibold">Solicitud rechazada</h2><p className="mt-1">{store.rejection_reason || "La solicitud necesita correcciones antes de volver a revisión."}</p><Link href="/mi-cuenta/tienda" className="mt-3 inline-flex">Corregir y reenviar</Link></Notice> : null}
      <section className="grid gap-4 sm:grid-cols-3"><Metric label="Estado" value={storeTrustLabel(store)} /><Metric label="Inventario concurrente" value={`${concurrent} / 50`} /><Metric label="En revisión" value={String(pending)} /></section>
      {concurrent >= 50 ? <Notice tone="warning" role="note"><h2 className="font-semibold">Límite de inventario alcanzado</h2><p className="mt-1">Las 50 posiciones concurrentes están ocupadas.</p></Notice> : null}
      <section className="rounded-panel border border-subtle bg-white p-5 text-sm leading-6 text-ink-2 sm:p-6">
        <h2 className="t-section text-ink">Cómo publica tu tienda</h2>
        {!store ? <p className="mt-2">Presenta la solicitud para vincular una tienda a esta cuenta. Cada cuenta puede tener una tienda.</p> : store.status === "active" && store.is_verified ? <p className="mt-2"><strong className="text-ink">Tienda verificada:</strong> tus publicaciones nuevas aparecen directamente si cumplen las reglas. La verificación no implica garantías de pago, entrega o condición.</p> : <p className="mt-2">Tus publicaciones nuevas pasan por revisión antes de aparecer. {store.status === "pending" ? "La tienda y sus publicaciones siguen ocultas al público hasta que se apruebe la solicitud." : "Las publicaciones aprobadas aparecen cuando la tienda está activa."}</p>}
        {store?.status === "active" ? <Link href={`/tiendas/${store.slug}`} className="mt-3 link inline-flex items-center gap-2 font-semibold">Ver tienda pública <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link> : null}
      </section>
    </div>
  );
}

function AccountNotices({ confirmed, welcomed, passwordUpdated, storeOwner }: { confirmed: boolean; welcomed: boolean; passwordUpdated: boolean; storeOwner: boolean }) {
  if (!confirmed && !welcomed && !passwordUpdated) return null;
  return <Notice tone="success" title={passwordUpdated ? "Contraseña actualizada" : confirmed ? "Correo confirmado" : "Cuenta creada"}><p className="mt-1 leading-6">{passwordUpdated ? "Tu contraseña se actualizó correctamente." : storeOwner ? "Tu cuenta de Tienda está activa." : "Tu cuenta Particular está activa para comprar y vender."}</p></Notice>;
}

// Same card as the analytics metrics (components/account-analytics.tsx). Labels are sentence case: uppercase
// is only for micro labels of three words or fewer (D6), and metric labels run longer.
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-panel border border-subtle bg-white p-5"><p className="t-ui font-semibold text-ink-2">{label}</p><p className="mt-3 text-[28px] font-bold leading-[32px] stretch-semicond tabular-nums text-ink">{value}</p></div>;
}

function storeTrustLabel(store: Awaited<ReturnType<typeof getAccountContext>>["store"]) {
  return store ? storeStatusEntry(store.status, store.is_verified).label : "Sin solicitud";
}
