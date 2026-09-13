import { AccountNavigation } from "@/components/account-navigation";
import { PageContainer } from "@/components/page-container";
import { getAccountContext } from "@/lib/account-context";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { profile, store } = await getAccountContext();
  const accountType = profile?.account_type === "store_owner" ? "store_owner" : "seller";

  return (
    <div className="min-h-full bg-laria-cloud/70">
      <PageContainer className="py-5 sm:py-7">
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:gap-6">
          <AccountNavigation accountType={accountType} hasStore={Boolean(store)} />
          <div className="min-w-0">{children}</div>
        </div>
      </PageContainer>
    </div>
  );
}
