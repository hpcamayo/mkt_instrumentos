"use client";

import dynamic from "next/dynamic";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";

// The question and its Supabase client (about 60 kB compressed) load only for a signed-in visitor, the only one it can
// ask, never with the listing page (launch audit A29).
const PurchaseCheckinQuestion = dynamic(() => import("@/components/purchase-checkin-question"), { ssr: false });

// big-08 "¿Cómo te fue?" on the listing page. `authenticated` keeps its value while the account is checked again on
// focus, so an open question isn't reset.
export function PurchaseCheckin({ listingId }: { listingId: string }) {
  const account = useMarketplaceAccount();
  if (!account.settled || !account.authenticated) return null;
  return <PurchaseCheckinQuestion listingId={listingId} />;
}
