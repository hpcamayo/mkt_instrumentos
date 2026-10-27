"use client";

import { useSyncExternalStore } from "react";
import { afterPage } from "@/components/after-page";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { cookieNames, hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

// The question and its Supabase client (about 60 kB compressed) load only for a visitor who may be signed in, the only
// one it can ask, never with the listing page (launch audit A29). If their code fails to download, it just isn't asked
// this time.
const PurchaseCheckinQuestion = afterPage(
  () => import("@/components/purchase-checkin-question").then((module) => module.default),
  { loading: () => null, failed: () => null },
);

// The browser's Supabase auth cookie, read again when the tab regains focus (after signing in or out in another one).
function subscribe(onChange: () => void) {
  window.addEventListener("focus", onChange);
  return () => window.removeEventListener("focus", onChange);
}
const browserHasAuthCookie = () => hasSupabaseAuthCookie(cookieNames(document.cookie));

// big-08 "¿Cómo te fue?" on the listing page. It loads when the browser has a Supabase auth cookie, as it did before
// A29 (the question looks the session up itself), or when the account check finds the visitor signed in, whichever
// comes first: a failed or slow account check (its merge of the device's favorites, say) doesn't hide it. Neither is
// known on the server or while hydrating, so the markup matches. `authenticated` keeps its value while the account is
// checked again on focus, so an open question isn't reset.
export function PurchaseCheckin({ listingId }: { listingId: string }) {
  const account = useMarketplaceAccount();
  const cookie = useSyncExternalStore(subscribe, browserHasAuthCookie, () => false);
  if (!cookie && !account.authenticated) return null;
  return <PurchaseCheckinQuestion listingId={listingId} />;
}
