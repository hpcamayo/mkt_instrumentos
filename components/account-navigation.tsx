"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { PageContainer } from "@/components/page-container";
import { useDisclosure } from "@/components/use-disclosure";
import { CountBadge } from "@/components/ui/tag";
import { accountItemIsActive, accountRoleLabel, getAccountNavigationItems, type AccountNavigationItem } from "@/lib/account-navigation";
import { cn } from "@/lib/utils";

type AccountType = "seller" | "store_owner";
export type AccountCounts = { unreadNotifications: number; pendingBuyerConfirmations: number };

// The account frame (docs/ux-redesign/ux-2-shell.md): a 248 px rail on desktop; on phones and tablets a switcher
// row under the header ("Mi cuenta · <section>") that opens the same list. Page content is UX-6.
export function AccountNavigation({
  accountType,
  hasStore,
  unreadNotifications,
  pendingBuyerConfirmations,
  name,
  city,
  children,
}: {
  accountType: AccountType;
  hasStore: boolean;
  unreadNotifications: number;
  pendingBuyerConfirmations: number;
  name?: string;
  city?: string | null;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const items = getAccountNavigationItems(accountType, hasStore);
  const active = items.find((item) => accountItemIsActive(pathname, item)) ?? items[0];
  const counts = { unreadNotifications, pendingBuyerConfirmations };
  const switcher = useDisclosure("account-switcher");

  return (
    <>
      <div className="border-b border-line-deco bg-surface lg:hidden">
        <PageContainer>
          <button
            ref={switcher.buttonRef}
            type="button"
            aria-expanded={switcher.open}
            aria-controls="menu-cuenta-movil"
            onClick={switcher.toggle}
            className="flex min-h-12 w-full items-center justify-between gap-3 text-left t-ui"
          >
            <span className="min-w-0 truncate">
              <span className="text-ink-2">Mi cuenta · </span>
              <span className="font-semibold text-ink">{active.label}</span>
            </span>
            <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-ink-2", switcher.open && "rotate-180")} />
          </button>
        </PageContainer>
        <div ref={switcher.panelRef} id="menu-cuenta-movil" hidden={!switcher.open} className="menu-fade border-t border-subtle">
          <PageContainer className="py-2">
            <nav aria-label="Menú de cuenta móvil" className="grid">
              <AccountSectionLinks items={items} pathname={pathname} counts={counts} />
              <div className="my-2 border-t border-subtle" />
              <AccountLogout />
            </nav>
          </PageContainer>
        </div>
      </div>

      <PageContainer className="py-6 lg:py-8">
        <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
          <div className="hidden lg:block">
            <div className="px-3">
              <p className="break-words t-ui font-semibold text-ink">{name || "Mi cuenta"}</p>
              <p className="t-meta">{[accountRoleLabel(accountType), city].filter(Boolean).join(" · ")}</p>
            </div>
            <nav aria-label="Navegación de cuenta" className="mt-4 grid gap-0.5">
              <AccountSectionLinks items={items} pathname={pathname} counts={counts} />
            </nav>
            <div className="mt-3 border-t border-subtle pt-3">
              <AccountLogout />
            </div>
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      </PageContainer>
    </>
  );
}

// The account sections with their counts, shared by the rail, the phone switcher and the header's account menu.
// `compact` rows are 36 px from 768 px (the header menu); 44 px everywhere on phones.
export function AccountSectionLinks({ items, pathname, counts, compact = false }: { items: AccountNavigationItem[]; pathname: string; counts: AccountCounts; compact?: boolean }) {
  return items.map((item) => {
    const active = accountItemIsActive(pathname, item);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-control px-3 t-ui font-semibold text-ink",
          compact && "md:min-h-9",
          active ? "bg-canvas shadow-[inset_3px_0_0_var(--accent)]" : "transition-colors duration-120 hover:bg-canvas",
        )}
      >
        <span className="min-w-0 flex-1">{item.label}</span>
        {item.icon === "notifications" ? (
          <CountBadge count={counts.unreadNotifications} label={`${counts.unreadNotifications} notificaciones sin leer`} />
        ) : null}
        {item.icon === "transactions" ? (
          <CountBadge count={counts.pendingBuyerConfirmations} label={`${counts.pendingBuyerConfirmations} compras requieren tu confirmación`} />
        ) : null}
      </Link>
    );
  });
}

export function AccountLogout({ compact = false }: { compact?: boolean }) {
  return (
    <LogoutButton className={cn("flex min-h-11 w-full items-center rounded-control px-3 text-left t-ui font-semibold text-ink-2 transition-colors duration-120 hover:bg-canvas hover:text-ink", compact && "md:min-h-9")}>
      Cerrar sesión
    </LogoutButton>
  );
}
