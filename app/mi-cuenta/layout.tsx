import { AccountNavigation } from "@/components/account-navigation";
import { PageContainer } from "@/components/page-container";
import { getAccountContext } from "@/lib/account-context";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { profile, store, supabase } = await getAccountContext();
  const accountType = profile?.account_type === "store_owner" ? "store_owner" : "seller";
  const { count: unreadNotifications } = supabase
    ? await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
    : { count: 0 };

  return (
    <div className="min-h-full bg-laria-cloud/70">
      <PageContainer className="py-5 sm:py-7">
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:gap-6">
          <AccountNavigation accountType={accountType} hasStore={Boolean(store)} unreadNotifications={unreadNotifications ?? 0} />
          <div className="min-w-0">{children}</div>
        </div>
      </PageContainer>
    </div>
  );
}
