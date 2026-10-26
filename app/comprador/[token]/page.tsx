import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SellerAvatar } from "@/components/listing/seller-card";
import { PageContainer } from "@/components/page-container";
import { formatAverage, monthYearLong, readBuyerCard } from "@/lib/deal-trust";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { getRequestReads } from "@/lib/supabase/public-read-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comprador en Laria", robots: NOINDEX_ROBOTS, referrer: "no-referrer" };

const TOKEN = /^[0-9a-f]{24}$/;

// «Comprador con historial» (safe-07): the card a buyer links in their message to a seller, only while they keep it on.
// Their first name, since when they buy in Laria, how many purchases both sides confirmed and the sellers' rating of
// them. Nothing else: no phone, no surname, no list of purchases.
export default async function BuyerCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) notFound();
  const { supabase } = getRequestReads();
  if (!supabase) notFound();
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_buyer_card", { p_token: token });
  if (error) throw new Error(`The buyer card could not be read: ${error.message}`);
  const card = readBuyerCard(data);
  if (!card) notFound();
  const since = monthYearLong(card.memberSince);
  return (
    <PageContainer as="section" className="py-6 sm:py-10">
      <div className="mx-auto grid max-w-xl gap-4 rounded-panel border border-subtle bg-white p-5 sm:p-8">
        <div className="flex items-center gap-3">
          <SellerAvatar seller={{ name: card.firstName, kind: "particular" }} size={64} />
          <div className="min-w-0">
            <p className="t-micro text-ink-2">Comprador en Laria</p>
            <h1 className="break-words t-page text-ink">{card.firstName}</h1>
          </div>
        </div>
        <ul className="grid gap-2 t-body text-ink">
          {since ? <li>Compra en Laria desde {since}</li> : null}
          <li>{card.verifiedPurchases === 1 ? "1 compra confirmada por quien vendió y quien compró" : `${card.verifiedPurchases} compras confirmadas por quien vendió y quien compró`}</li>
          {card.ratingCount > 0 && card.averageRating !== null ? (
            <li>Los vendedores le dieron {formatAverage(card.averageRating)} de 5 ({card.ratingCount === 1 ? "1 reseña" : `${card.ratingCount} reseñas`})</li>
          ) : <li>Aún sin reseñas de vendedores</li>}
        </ul>
        <p className="t-meta">
          {card.firstName} eligió mostrar esta tarjeta. Viene de compras que ambas partes confirmaron en Laria; no dice nada
          sobre pagos, y Laria no garantiza una compra.
        </p>
      </div>
    </PageContainer>
  );
}
