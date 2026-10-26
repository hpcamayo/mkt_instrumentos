"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { formatPrice } from "@/lib/price";
import { formatLimaDateTime, privateOfferMessage, sellingDb, withWhatsAppMessage, type ListingSellingPublic } from "@/lib/selling-tools";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

// What the selling tools add to a listing page, read after it loads (the page itself stays the same for everyone):
// "En consignación en <Tienda>" (sell-03), "Aceptamos tu equipo como parte de pago" (run-04) and, for a person who
// saved the listing, the seller's private offer with a WhatsApp link that quotes it (sell-05).
export function ListingSellingExtras({ listingId, title, contactHref, className }: { listingId: string; title: string; contactHref: string; className?: string }) {
  const account = useMarketplaceAccount();
  const [extras, setExtras] = useState<ListingSellingPublic | null>(null);

  useEffect(() => {
    if (!account.ready) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let active = true;
    void sellingDb(client).rpc("get_listing_selling_public", { p_listing_id: listingId }).then(({ data }) => {
      if (active && data) setExtras(data as ListingSellingPublic);
    }, () => undefined);
    return () => { active = false; };
  }, [account.ready, account.authenticated, listingId]);

  if (!extras || (!extras.consignment && !extras.part_payment && !extras.private_offer)) return null;
  const offer = extras.private_offer;
  return (
    <div className={cn("grid gap-3", className)}>
      {offer ? (
        <section aria-labelledby="oferta-para-ti" className="grid gap-2 rounded-panel border border-line-strong bg-accent-tint p-4">
          <h2 id="oferta-para-ti" className="t-ui font-semibold text-ink">Oferta para ti: {formatPrice(offer.price_pen)}</h2>
          <p className="t-ui text-ink">
            Quien vende te la envió porque guardaste esta publicación. Vale hasta el {formatLimaDateTime(offer.valid_until)}; el precio publicado sigue en {formatPrice(offer.public_price_pen)}.
          </p>
          {offer.message ? <p className="t-ui text-ink-2">“{offer.message}”</p> : null}
          <WhatsAppContactLink
            href={withWhatsAppMessage(contactHref, privateOfferMessage(title, offer))}
            listingId={listingId}
            className={buttonClasses({ variant: "secondary", className: "w-fit" })}
          >
            <WhatsAppGlyph />
            Pedir este precio por WhatsApp
          </WhatsAppContactLink>
        </section>
      ) : null}
      {extras.consignment ? (
        <p className="t-ui text-ink">
          En consignación en <Link href={`/tiendas/${extras.consignment.store_slug}`} className="link font-semibold">{extras.consignment.store_name}</Link>: el equipo es de un particular y la tienda atiende la venta.
        </p>
      ) : null}
      {extras.part_payment ? (
        <div className="grid gap-1 rounded-panel bg-canvas p-4">
          <p className="t-ui font-semibold text-ink">Aceptamos tu equipo como parte de pago</p>
          <p className="t-ui text-ink-2">Envía fotos de lo que dejarías y la tienda te responde con un estimado. El valor final se confirma al revisarlo.</p>
          <Link href={`/mi-cuenta/equipo/parte-de-pago?publicacion=${listingId}`} className="link w-fit t-ui font-semibold">Ofrecer mi equipo</Link>
        </div>
      ) : null}
    </div>
  );
}
