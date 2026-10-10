"use client";

import { useEffect, type ReactNode } from "react";
import { sendBrowsingEvent } from "@/lib/marketplace-events-client";

type ListingDetailMetadataProps = {
  listingId: string;
  // The place and "Publicado hace 3 días", composed on the server so the first render matches.
  children: ReactNode;
  trackView?: boolean;
};

// The listing's date line. It also registers the detail view (AN-002) while the page is visible, and again when it
// becomes visible; never for a sold listing. The count stays private: no "Visto N veces" on the page (UX-4 L6 A, F3);
// the owner sees views in Mi cuenta.
export function ListingDetailMetadata({
  listingId,
  children,
  trackView = true,
}: ListingDetailMetadataProps) {
  useEffect(() => {
    if (!trackView) return;

    function registerView() {
      if (document.visibilityState !== "visible") return;
      void sendBrowsingEvent({ type: "listing_view", listingId, source: "detail" }, listingId);
    }
    registerView();
    document.addEventListener("visibilitychange", registerView);

    return () => {
      document.removeEventListener("visibilitychange", registerView);
    };
  }, [listingId, trackView]);

  return <span className="t-meta">{children}</span>;
}
