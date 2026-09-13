import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { getAccountContext } from "@/lib/account-context";
import { listingStatusLabel } from "@/lib/account-ui";
import { isSellerProfileComplete } from "@/lib/auth/profile";

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
        <section className="flex flex-col gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><h1 className="font-black">Completa tu perfil Particular</h1><p className="mt-1 text-sm leading-6">Revisa tu nombre, WhatsApp y ubicación antes de publicar.</p></div></div>
          <Link href="/mi-cuenta/perfil" className="laria-button-secondary min-h-10 px-4 py-2 text-sm">Completar perfil</Link>
        </section>
      ) : null}

      <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">Resumen Particular</p>
        <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="text-3xl font-black tracking-tight text-laria-ink">Hola, {profile?.full_name || user.email || "bienvenido"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-laria-text-soft">Compra y vende desde una sola cuenta. Tus publicaciones siempre quedan vinculadas a este perfil.</p></div>
          <Link href="/mi-cuenta/publicar" className="laria-button-primary min-h-11 px-4 py-3 text-sm">Publicar instrumento</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Resumen de publicaciones">
        <Metric label="Publicaciones recientes" value={String(listings?.length ?? 0)} />
        <Metric label="En revisión" value={String(listings?.filter((item) => item.status === "pending").length ?? 0)} />
        <Metric label="Aprobadas" value={String(listings?.filter((item) => item.status === "approved").length ?? 0)} />
      </section>

      <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-laria-blue">Publicaciones recientes</p><h2 className="mt-1 text-xl font-black text-laria-ink">Mis publicaciones</h2></div><Link href="/mi-cuenta/publicaciones" className="font-black text-laria-blue">Ver todas</Link></div>
        {listings?.length ? <ul className="mt-4 divide-y divide-laria-fog">{listings.map((listing) => <li key={listing.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="font-bold text-laria-ink">{listing.title}</span><span className="text-laria-text-soft">{listingStatusLabel(listing.status)}</span></li>)}</ul> : <p className="mt-4 text-sm text-laria-text-soft">Aún no tienes publicaciones. Puedes crear la primera desde este panel.</p>}
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
      <section className="rounded-lg bg-laria-black p-5 text-white shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-yellow">Resumen de Tienda</p>
        <h1 className="mt-2 text-3xl font-black">{store?.name ?? "Completa la solicitud de tu tienda"}</h1>
        <p className="mt-2 text-sm text-white/70">{store?.razon_social ?? email}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/mi-cuenta/tienda" className="laria-button-primary min-h-11 px-4 py-3 text-sm">{store ? "Administrar mi tienda" : "Iniciar solicitud"}</Link>
          {store ? <Link href="/mi-cuenta/tienda/publicar" className="inline-flex min-h-11 items-center rounded-md bg-white px-4 py-3 text-sm font-black text-laria-black">Publicar producto</Link> : null}
          {store ? <Link href="/mi-cuenta/tienda/inventario" className="inline-flex min-h-11 items-center rounded-md border border-white/30 px-4 py-3 text-sm font-black">Ver inventario</Link> : null}
        </div>
      </section>
      {store?.status === "rejected" ? <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><h2 className="font-black">Solicitud rechazada</h2><p className="mt-1">{store.rejection_reason || "La solicitud necesita correcciones antes de volver a revisión."}</p><Link href="/mi-cuenta/tienda" className="mt-3 inline-flex font-black underline">Corregir y reenviar</Link></section> : null}
      <section className="grid gap-4 sm:grid-cols-3"><Metric label="Estado" value={storeTrustLabel(store)} /><Metric label="Inventario concurrente" value={`${concurrent} / 50`} /><Metric label="Pendientes" value={String(pending)} /></section>
      {concurrent >= 50 ? <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><h2 className="font-black">Límite de inventario alcanzado</h2><p className="mt-1">Las 50 posiciones concurrentes están ocupadas.</p></section> : null}
      <section className="rounded-lg border border-laria-fog bg-white p-5 text-sm leading-6 text-laria-text-soft shadow-sm sm:p-6">
        <h2 className="text-xl font-black text-laria-ink">Publicación de inventario</h2>
        {!store ? <p className="mt-2">Presenta la solicitud para vincular una tienda a esta cuenta. La base de datos permite una sola tienda por propietario.</p> : store.status === "active" && store.is_verified ? <p className="mt-2"><strong className="text-laria-ink">Tienda Verificada:</strong> el inventario válido nuevo puede publicarse directamente. La verificación no implica garantías de pago, entrega o condición.</p> : <p className="mt-2">El inventario nuevo requiere moderación. {store.status === "pending" ? "La tienda y sus productos siguen ocultos al público hasta la aprobación básica." : "Las publicaciones aprobadas aparecen cuando la tienda está activa."}</p>}
        {store?.status === "active" ? <Link href={`/tiendas/${store.slug}`} className="mt-3 inline-flex items-center gap-2 font-black text-laria-blue">Ver tienda pública <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link> : null}
      </section>
    </div>
  );
}

function AccountNotices({ confirmed, welcomed, passwordUpdated, storeOwner }: { confirmed: boolean; welcomed: boolean; passwordUpdated: boolean; storeOwner: boolean }) {
  if (!confirmed && !welcomed && !passwordUpdated) return null;
  return <section role="status" className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><p className="font-black">{passwordUpdated ? "Contraseña actualizada" : confirmed ? "Correo confirmado" : "Cuenta creada"}</p><p className="mt-1 leading-6">{passwordUpdated ? "Tu contraseña se actualizó correctamente." : storeOwner ? "Tu cuenta de Tienda está activa." : "Tu cuenta Particular está activa para comprar y vender."}</p></div></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-laria-text-soft">{label}</p><p className="mt-3 text-2xl font-black text-laria-ink">{value}</p></div>;
}

function storeTrustLabel(store: Awaited<ReturnType<typeof getAccountContext>>["store"]) {
  if (!store) return "Sin solicitud";
  if (store.status === "pending") return "Solicitud pendiente";
  if (store.status === "rejected") return "Solicitud rechazada";
  if (store.status === "hidden") return "Tienda no pública";
  return store.is_verified ? "Tienda Verificada" : "Tienda";
}
