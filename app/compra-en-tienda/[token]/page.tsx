import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { SellerAvatar } from "@/components/listing/seller-card";
import { PageContainer } from "@/components/page-container";
import { ClaimCounterPurchase } from "@/components/trust/claim-counter-purchase";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { VerifiedMark } from "@/components/ui/verified-mark";
import { readCounterPurchase } from "@/lib/deal-trust";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

// The code is the only key to this page: it is never indexed and never sent on to another site.
export const metadata: Metadata = { title: "Confirmar compra en tienda", robots: NOINDEX_ROBOTS, referrer: "no-referrer" };

const TOKEN = /^[0-9a-f]{32}$/;

// «Compra en tienda verificada» (reach-11): the page the customer's phone opens from the store's code. It names the
// store and what was sold, and with one press (signed in) the purchase becomes a verified purchase with reviews.
export default async function CounterPurchasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = TOKEN.test(token) ? await getSupabaseServerClient() : null;
  const result = supabase ? await (supabase as unknown as SupabaseClient).rpc("get_counter_purchase", { p_token: token }) : null;
  if (result?.error) throw new Error(`The counter purchase could not be read: ${result.error.message}`);
  const purchase = readCounterPurchase(result?.data ?? null);
  const signedIn = supabase ? Boolean((await supabase.auth.getUser()).data.user) : false;
  const next = `/compra-en-tienda/${token}`;

  return (
    <PageContainer as="section" className="py-6 sm:py-10">
      <div className="mx-auto grid max-w-xl gap-5 rounded-panel border border-subtle bg-white p-5 sm:p-8">
        {purchase.status === "not_found" || !purchase.store ? (
          <>
            <h1 className="t-page text-ink">Este código no es válido</h1>
            <p className="t-body text-ink-2">Pide a la tienda que te muestre el código de nuevo.</p>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <SellerAvatar seller={{ name: purchase.store.name, kind: purchase.store.verified ? "verified" : "store", logoUrl: purchase.store.logoUrl }} size={64} />
              <div className="min-w-0">
                <p className="t-micro text-ink-2">Compra en tienda</p>
                <h1 className="break-words t-page text-ink">{purchase.store.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 t-ui text-ink-2">
                  {purchase.store.verified ? <VerifiedMark /> : null}
                  {[purchase.store.district, purchase.store.city].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>
            {purchase.lines.length ? (
              <ul className="grid gap-1 rounded-control bg-canvas p-3 t-ui text-ink">
                {purchase.lines.map((line, index) => <li key={`${index}-${line.name}`}>{line.quantity > 1 ? `${line.quantity} × ` : ""}{line.name}</li>)}
              </ul>
            ) : null}
            <CounterPurchaseState purchase={purchase} token={token} signedIn={signedIn} next={next} />
            <p className="t-meta">
              Confirmar solo dice que compraste en esta tienda; habilita las reseñas de los dos durante 10 días. Laria no cobra,
              no recibe pagos y no da garantía sobre lo que compraste: eso lo ves con la tienda.
            </p>
          </>
        )}
      </div>
    </PageContainer>
  );
}

function CounterPurchaseState({
  purchase,
  token,
  signedIn,
  next,
}: {
  purchase: ReturnType<typeof readCounterPurchase>;
  token: string;
  signedIn: boolean;
  next: string;
}) {
  if (purchase.status === "claimed") {
    return purchase.mine && purchase.transactionId ? (
      <Notice tone="success" role="status" title="Ya confirmaste esta compra">
        <Link href={`/mi-cuenta/transacciones/${purchase.transactionId}`} className="link mt-1 inline-block font-semibold">Reseñar a la tienda</Link>
      </Notice>
    ) : (
      <Notice tone="info" role="status">Otra cuenta ya confirmó esta compra.</Notice>
    );
  }
  if (purchase.status === "cancelled") return <Notice tone="info" role="status">La tienda cerró este código o deshizo la venta.</Notice>;
  if (purchase.status === "expired") return <Notice tone="info" role="status">Este código venció. Se puede confirmar hasta 24 horas después de la compra.</Notice>;
  if (purchase.ownStore) return <Notice tone="info" role="status">Es una venta de tu propia tienda: el código es para tu cliente.</Notice>;
  if (!signedIn) {
    return (
      <div className="grid gap-3">
        <p className="t-body text-ink">Ingresa a tu cuenta de Laria para confirmar la compra y poder reseñar a la tienda.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClasses({})}>Ingresar</Link>
          <Link href={`/registro/vendedor?next=${encodeURIComponent(next)}`} className={buttonClasses({ variant: "secondary" })}>Crear cuenta</Link>
        </div>
      </div>
    );
  }
  return <ClaimCounterPurchase token={token} storeName={purchase.store?.name ?? "la tienda"} />;
}
