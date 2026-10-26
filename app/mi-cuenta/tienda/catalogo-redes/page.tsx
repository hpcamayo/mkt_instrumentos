import { redirect } from "next/navigation";
import { FeedSwitch } from "@/components/store-reach/feed-settings";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { absoluteUrl } from "@/lib/site";
import { googleShoppingActive, parseFeedSettings } from "@/lib/store-feed-settings";
import { storeReachDb } from "@/lib/store-reach-db";

export const metadata = { title: "Catálogo para redes" };

const numbers = new Intl.NumberFormat("es-PE");

// reach-02 (docs/feature-ideas/store-reach.md): the store's feed for its Meta catalog (Instagram, Facebook, WhatsApp
// Business), off until the store turns it on, and where Google stands.
export default async function StoreFeedPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { data, error } = await storeReachDb(supabase).rpc("get_store_feed_settings");
  const settings = error ? null : parseFeedSettings(data);
  const feedUrl = absoluteUrl(`/api/feeds/tiendas/${store.slug}`);

  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Mi tienda"
          title="Catálogo para redes"
          meta={(
            <p>
              Muestra tus instrumentos publicados en Laria en tu tienda de Instagram y Facebook y en el catálogo de WhatsApp Business.
              Los mantienes al día en Laria y Meta lee el precio y el stock de aquí.
            </p>
          )}
        />
      </section>

      {!settings ? (
        <Notice tone="warning">No se pudo cargar tu catálogo. Intenta nuevamente más tarde.</Notice>
      ) : (
        <>
          <section aria-labelledby="catalogo-estado" className="space-y-4 rounded-panel border border-subtle bg-surface p-5 sm:p-6">
            <div>
              <h2 id="catalogo-estado" className="t-section text-ink">{settings.enabled ? "Tu catálogo está activo" : "Tu catálogo está desactivado"}</h2>
              <p className="mt-1 t-meta text-ink-2">
                {settings.enabled
                  ? "Cualquiera con el enlace puede leer tus publicaciones activas, como en Laria. Desactívalo cuando quieras."
                  : "Mientras esté desactivado, el enlace no existe y nada de tu tienda sale de Laria."}
              </p>
            </div>
            {!settings.storeActive ? <Notice tone="info">Podrás activarlo cuando tu tienda esté activa.</Notice> : null}
            <FeedSwitch enabled={settings.enabled} feedUrl={feedUrl} canEnable={settings.storeActive} />
            <ul className="space-y-1 t-ui text-ink">
              <li>{numbers.format(settings.items)} {settings.items === 1 ? "publicación entra" : "publicaciones entran"} en el catálogo{settings.outOfStock ? `, ${numbers.format(settings.outOfStock)} como agotadas` : ""}.</li>
              {settings.withoutPhoto || settings.withoutPrice ? (
                <li>No entran {[settings.withoutPhoto ? `${numbers.format(settings.withoutPhoto)} sin foto` : null, settings.withoutPrice ? `${numbers.format(settings.withoutPrice)} sin precio` : null].filter(Boolean).join(" ni ")}: Meta las exige.</li>
              ) : null}
              {settings.withoutBrand ? <li>{numbers.format(settings.withoutBrand)} no tienen marca. Meta puede rechazarlas; agrégala al editar la publicación.</li> : null}
            </ul>
          </section>

          <section aria-labelledby="catalogo-meta" className="space-y-3 rounded-panel border border-subtle bg-surface p-5 sm:p-6">
            <h2 id="catalogo-meta" className="t-section text-ink">Conectarlo a Meta, una sola vez</h2>
            <ol className="list-decimal space-y-2 pl-5 t-body text-ink">
              <li>Entra a Commerce Manager de Meta con la cuenta que administra tu página de Facebook o tu cuenta de Instagram.</li>
              <li>Crea un catálogo de comercio electrónico o abre el que ya usas.</li>
              <li>En los orígenes de datos, agrega uno por enlace con actualización programada y pega el enlace de tu catálogo. Elige que se lea cada día o cada hora. La moneda es PEN.</li>
              <li>Conecta el catálogo a tu cuenta de Instagram, a tu página de Facebook o a WhatsApp Business.</li>
            </ol>
            <ul className="list-disc space-y-2 pl-5 t-meta text-ink-2">
              <li>Cada instrumento lleva a su publicación en Laria, donde te contactan por WhatsApp. Laria no cobra comisiones ni procesa pagos.</li>
              <li>Meta lee el enlace con la frecuencia que elijas: un cambio de precio o de stock aparece allá en la siguiente lectura.</li>
              <li>El catálogo en Meta queda en tu cuenta y bajo las políticas de comercio de Meta. Meta decide qué funciones de compra ofrece en Perú y puede rechazar publicaciones.</li>
            </ul>
          </section>

          <section aria-labelledby="catalogo-google" className="space-y-2 rounded-panel border border-subtle bg-surface p-5 sm:p-6">
            <h2 id="catalogo-google" className="t-section text-ink">Google</h2>
            <p className="t-body text-ink">
              Google solo acepta catálogos de páginas cuyo dominio controla quien los envía, así que tu tienda no puede enviar sus publicaciones de Laria
              desde su propia cuenta.{" "}
              {googleShoppingActive()
                ? "Laria envía todas sus publicaciones activas a la pestaña Shopping de Google desde su propia cuenta, sin anuncios. No tienes que hacer nada."
                : "Laria prepara el envío de todas sus publicaciones activas a la pestaña Shopping de Google desde su propia cuenta. Aún no está activo."}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
