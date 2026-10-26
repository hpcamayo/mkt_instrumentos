import Link from "next/link";
import { redirect } from "next/navigation";
import { MercadoLibreDisconnect, MercadoLibrePicker } from "@/components/store-reach/mercadolibre-picker";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { mercadoLibreConfig } from "@/lib/mercadolibre/config";
import { storeReachDb } from "@/lib/store-reach-db";

export const metadata = { title: "Importar desde Mercado Libre" };

// What the connect and callback steps send back (?resultado=…), in the owner's words.
const RESULTS: Record<string, { tone: "success" | "warning" | "danger"; text: string }> = {
  conectado: { tone: "success", text: "Listo: tu cuenta de Mercado Libre está conectada. Elige qué publicaciones traer." },
  cancelado: { tone: "warning", text: "No se conectó: la autorización se canceló en Mercado Libre." },
  vencido: { tone: "warning", text: "La autorización tardó demasiado o ya se usó. Vuelve a conectar." },
  "tienda-inactiva": { tone: "warning", text: "Podrás conectar Mercado Libre cuando tu tienda esté activa." },
  "no-disponible": { tone: "warning", text: "La importación desde Mercado Libre no está disponible por ahora." },
  ingresa: { tone: "warning", text: "Ingresa con tu cuenta de tienda y vuelve a conectar." },
  solicitud: { tone: "danger", text: "No pudimos iniciar la conexión. Vuelve a intentarlo desde esta página." },
  error: { tone: "danger", text: "Mercado Libre no completó la conexión. Vuelve a intentarlo en unos minutos." },
};

// reach-01 (docs/feature-ideas/store-reach.md): connect the store's Mercado Libre account and bring publications into
// an ordinary import. Off, and saying so, until Laria sets up its Mercado Libre application.
export default async function MercadoLibreImportPage({ searchParams }: { searchParams: Promise<{ resultado?: string }> }) {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { resultado } = await searchParams;
  const result = resultado ? RESULTS[resultado] : undefined;
  const available = Boolean(mercadoLibreConfig());
  const { data } = await storeReachDb(supabase).rpc("get_mercadolibre_connection");
  const connection = data as { connected?: boolean; nickname?: string | null } | null;
  const active = store.status === "active";

  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Mi tienda"
          title="Importar desde Mercado Libre"
          meta={(
            <p>
              Trae tus publicaciones de Mercado Libre a tu inventario de Laria: título, fotos, precio, stock, marca, modelo y descripción. Las
              revisas antes de aplicarlas y luego decides cuáles publicar.
            </p>
          )}
        />
      </section>

      {result ? <Notice tone={result.tone} role={result.tone === "danger" ? "alert" : "status"}>{result.text}</Notice> : null}

      <section aria-labelledby="ml-que-hace" className="space-y-2 rounded-panel border border-subtle bg-surface p-5 sm:p-6">
        <h2 id="ml-que-hace" className="t-section text-ink">Qué hace Laria con tu cuenta</h2>
        <ul className="list-disc space-y-2 pl-5 t-body text-ink">
          <li>Te lleva a Mercado Libre para que autorices el acceso. Laria no ve tu contraseña.</li>
          <li>Solo lee tus publicaciones activas cuando tú lo pides. No publica, no cambia ni pausa nada en Mercado Libre.</li>
          <li>Lo que elijas pasa por la importación de Inventario: revisas cada fila, completas lo que falte (por ejemplo, la condición de un usado o un precio en dólares) y decides qué aplicar.</li>
          <li>Publicarlas en Laria sigue la revisión y el límite de publicaciones de siempre.</li>
          <li>Puedes desconectar cuando quieras. Para quitar el acceso también en Mercado Libre, retira a Laria de las aplicaciones conectadas de tu cuenta.</li>
        </ul>
      </section>

      <section aria-labelledby="ml-cuenta" className="space-y-4 rounded-panel border border-subtle bg-surface p-5 sm:p-6">
        <h2 id="ml-cuenta" className="t-section text-ink">Tu cuenta de Mercado Libre</h2>
        {connection?.connected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="t-body text-ink">Conectada{connection.nickname ? <> como <span className="font-semibold">{connection.nickname}</span></> : null}.</p>
              <MercadoLibreDisconnect />
            </div>
            {available && active ? <MercadoLibrePicker /> : null}
            {!available ? <Notice tone="info">La importación desde Mercado Libre no está disponible por ahora.</Notice> : null}
          </>
        ) : !available ? (
          <Notice tone="info">
            La importación desde Mercado Libre aún no está disponible. Mientras tanto, puedes descargar tus publicaciones de Mercado Libre en Excel y{" "}
            <Link href="/mi-cuenta/tienda/inventario/importar">subirlas en Inventario</Link>.
          </Notice>
        ) : !active ? (
          <Notice tone="info">Podrás conectar Mercado Libre cuando tu tienda esté activa.</Notice>
        ) : (
          <form method="post" action="/api/store/mercado-libre/connect">
            <Button type="submit">Conectar con Mercado Libre</Button>
          </form>
        )}
      </section>
    </div>
  );
}
