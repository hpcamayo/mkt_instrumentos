import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { AccountNavigation } from "@/components/account-navigation";
import { getAccountContext } from "@/lib/account-context";
import { assistedCommerceEnabled } from "@/lib/payment-methods";
import { inventoryDb } from "@/lib/store-inventory";

// Private account/Admin surfaces are never indexable.
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, store, supabase } = await getAccountContext();
  const accountType = profile?.account_type === "store_owner" ? "store_owner" : "seller";
  const payments = accountType === "store_owner" && Boolean(store) && assistedCommerceEnabled();
  const [{ count: unreadNotifications }, { data: pendingBuyerConfirmations }, { data: purchaseRequests }] = supabase
    ? await Promise.all([supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null), supabase.rpc("get_pending_buyer_confirmation_count"),
      // Effortless Laria, inventory batch (stock-04): the count on "Solicitudes".
      payments ? inventoryDb(supabase).rpc("get_store_purchase_request_count") : Promise.resolve({ data: 0 })])
    : [{ count: 0 }, { data: 0 }, { data: 0 }];

  return (
    <AccountNavigation
      accountType={accountType}
      hasStore={Boolean(store)}
      payments={payments}
      unreadNotifications={unreadNotifications ?? 0}
      pendingBuyerConfirmations={pendingBuyerConfirmations ?? 0}
      purchaseRequests={Number(purchaseRequests) || 0}
      name={profile?.full_name?.trim() || user.email || undefined}
      city={profile?.city}
    >
      {children}
    </AccountNavigation>
  );
}
