import { FavoriteButton } from "@/components/favorite-button";
import { SafetyLine } from "@/components/listing/contact-extras";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { PurchaseRequestLink } from "@/components/payment/purchase-request-link";
import { BarHeight } from "@/components/ui/bar-height";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { cn } from "@/lib/utils";

// The listing's one contact module (UX-4 L4 A, L10 A): "Contactar por WhatsApp" (primary, 52 px, `source` detail) and
// "Guardar". From 1024 px it sits in the decision column, the favourite full width under the button; below 1024 px the
// same element becomes the bar at the bottom of the screen (`.contact-bar` in app/globals.css), the favourite as a
// 44 px square beside the button and one line under them. So the page has one WhatsApp button, reached by Tab right
// after the identity block. Sold listings render none of it. PAY-1 (design §11.1): when the store currently shows
// accepted payment methods and the listing has units, the same button reads "Solicitar compra" and opens WhatsApp with
// the purchase message; it is still the one WhatsApp contact, recorded with the purchase intent.
// Effortless Laria: the line under it is the page's one limitation statement with "Cómo comprar seguro" (list-02), and
// `safety` shows the safety sheet once before the first contact about something expensive or a purchase (talk-04).
// stock-23 (inventory batch): a purchase request for a listing with more than one unit available asks how many first.
// talk-06 (maybes): while the seller holds the listing for someone, "Avísame si se libera" leads and this button stays
// as the secondary action; its message (the page builds it) mentions the reservation.
export function ContactModule({ listingId, href, purchase = false, maxQuantity = 1, safety = false, reserved = false, className }: { listingId: string; href: string; purchase?: boolean; maxQuantity?: number; safety?: boolean; reserved?: boolean; className?: string }) {
  return (
    <div className={cn("contact-bar grid gap-2 lg:gap-3", className)}>
      <div className="flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3">
        {purchase && maxQuantity > 1 ? (
          <PurchaseRequestLink href={href} listingId={listingId} maxQuantity={maxQuantity} safety={safety} className={buttonClasses({ size: "lg", className: "min-w-0 flex-1 px-3 text-[16px] min-[400px]:px-5 min-[400px]:text-[18px] lg:w-full lg:flex-none" })} />
        ) : (
          <WhatsAppContactLink href={href} listingId={listingId} intent={purchase ? "purchase" : undefined} safety={safety} className={buttonClasses({ variant: reserved ? "secondary" : "primary", size: "lg", className: "min-w-0 flex-1 px-3 text-[16px] min-[400px]:px-5 min-[400px]:text-[18px] lg:w-full lg:flex-none" })}>
            <WhatsAppGlyph />
            {purchase ? "Solicitar compra" : "Contactar por WhatsApp"}
          </WhatsAppContactLink>
        )}
        <FavoriteButton listingId={listingId} variant="module" />
      </div>
      <SafetyLine className="text-center lg:text-left" />
      <BarHeight variable="--contact-bar-height" />
    </div>
  );
}
