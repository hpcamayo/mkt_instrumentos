import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { timeLabel } from "@/lib/store-floor/dates";
import { loadStoreTryoutsToday, loadTryoutSettings } from "@/lib/store-floor/tryouts-server";

// Mi tienda: the day's try-outs (buy-07) and the store-floor settings (warranty, try-outs, labels and poster).
export async function StoreFloorPanel({ storeId, supabase }: { storeId: string; supabase: SupabaseClient }) {
  const [settings, day, { count: policies }] = await Promise.all([
    loadTryoutSettings(supabase, storeId),
    loadStoreTryoutsToday(supabase, storeId),
    supabase.from("store_warranty_policies").select("store_id", { count: "exact", head: true }).eq("store_id", storeId),
  ]);
  return (
    <section aria-labelledby="tienda-piso" className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
      <h2 id="tienda-piso" className="t-ui font-semibold text-ink">En tu local</h2>
      {day.today.length || day.pending ? (
        <div className="grid gap-1 rounded-control bg-canvas p-3">
          <p className="t-ui font-semibold text-ink">
            <Link href="/mi-cuenta/tienda/pruebas" className="link">Pruebas de hoy</Link>
            {day.pending ? <span className="font-normal text-ink-2"> · {day.pending === 1 ? "1 por confirmar" : `${day.pending} por confirmar`}</span> : null}
          </p>
          {day.today.length ? (
            <ul className="grid gap-0.5">
              {day.today.map((tryout) => (
                <li key={tryout.id} className="t-ui text-ink"><span className="font-semibold tabular-nums">{timeLabel(tryout.starts_at)}</span> · {tryout.buyer_name} · {tryout.listing_title}</li>
              ))}
            </ul>
          ) : <p className="t-meta">Ninguna confirmada para hoy.</p>}
        </div>
      ) : null}
      <ul className="grid gap-2 t-ui text-ink-2">
        <li>
          <Link href="/mi-cuenta/tienda/garantia" className="link font-semibold">Garantía y cambios</Link>
          {policies ? ": se muestra en tus publicaciones." : ": dilo una vez por condición y aparece junto al precio."}
        </li>
        <li>
          <Link href="/mi-cuenta/tienda/pruebas" className="link font-semibold">Pruebas</Link>
          {settings.enabled ? ": recibes reservas para probar en tu tienda." : ": deja que reserven un horario para probar antes de comprar."}
        </li>
        <li>
          <Link href="/mi-cuenta/tienda/etiquetas" className="link font-semibold">Etiquetas</Link>
          {" y "}
          <Link href="/mi-cuenta/tienda/etiquetas/cartel" className="link font-semibold">cartel con QR</Link>
          : precios con código de barras para Mostrador y un QR a tu tienda.
        </li>
      </ul>
    </section>
  );
}
