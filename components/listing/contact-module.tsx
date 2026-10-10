import { FavoriteButton } from "@/components/favorite-button";
import { SafetyLink, TRUST_COPY } from "@/components/listing/trust-note";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { cn } from "@/lib/utils";

// The listing's one contact module (UX-4 L4 A, L10 A): "Contactar por WhatsApp" (primary, 52 px, `source` detail) and
// "Guardar". From 1024 px it sits in the decision column, the favourite full width under the button; below 1024 px the
// same element becomes the bar at the bottom of the screen (`.contact-bar` in app/globals.css), the favourite as a
// 44 px square beside the button and one line under them. So the page has one WhatsApp button, reached by Tab right
// after the identity block. Sold listings render none of it.
export function ContactModule({ listingId, href, className }: { listingId: string; href: string; className?: string }) {
  return (
    <div className={cn("contact-bar grid gap-2 lg:gap-3", className)}>
      <div className="flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3">
        <WhatsAppContactLink href={href} listingId={listingId} className={buttonClasses({ size: "lg", className: "min-w-0 flex-1 px-3 text-[16px] min-[400px]:px-5 min-[400px]:text-[18px] lg:w-full lg:flex-none" })}>
          <WhatsAppGlyph />
          Contactar por WhatsApp
        </WhatsAppContactLink>
        <FavoriteButton listingId={listingId} variant="module" />
      </div>
      <p className="text-center t-meta lg:hidden">
        {TRUST_COPY.bar} · <SafetyLink />
      </p>
    </div>
  );
}
