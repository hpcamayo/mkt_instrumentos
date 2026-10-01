"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { Bell, Search, UserRound } from "lucide-react";
import { AccountLogout, AccountSectionLinks } from "@/components/account-navigation";
import { BrandLogo } from "@/components/brand-logo";
import { GlobalSearch } from "@/components/global-search";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { PageContainer } from "@/components/page-container";
import { useDisclosure } from "@/components/use-disclosure";
import { buttonClasses } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/tag";
import { accountRoleLabel, getAccountNavigationItems, getSellEntry } from "@/lib/account-navigation";
import type { ShellLayout } from "@/lib/shell";
import { initials } from "@/lib/ui/initials";
import { cn } from "@/lib/utils";

// "Vender" looks 36 px tall (N1); on phones its target grows to 44 px without changing its look.
const SELL_HIT_AREA = "relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] md:before:hidden";
// Icon entries on the black bar: 44 px targets, no border.
const ICON_ENTRY = "relative inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-control text-surface transition-colors duration-120 hover:bg-white/10 [&_svg]:h-5 [&_svg]:w-5";

// The black bar (docs/ux-redesign/ux-2-shell.md): 64 px from 768 px with the search inline, 56 px on phones with
// the search as a row under the bar on browse pages (or behind an icon on listing pages). It scrolls with the
// page (N3). "Vender" is the outline button on dark (N1); the last item's visible edge sits on the gutter.
export function SiteHeader({ layout }: { layout: ShellLayout }) {
  const account = useMarketplaceAccount();
  const search = useDisclosure("header-search");
  const inputRef = useRef<HTMLInputElement>(null);
  const publishing = layout.header === "publishing";
  const sell = getSellEntry(account);
  const phoneSearchVisible = layout.phoneSearch === "row" || (layout.phoneSearch === "toggle" && search.open);

  useEffect(() => {
    if (search.open) inputRef.current?.focus();
  }, [search.open]);

  return (
    <header className="surface-frame bg-frame text-surface">
      <PageContainer className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center">
        <Link href="/" aria-label="Laria inicio" className="col-start-1 row-start-1 flex h-14 w-fit items-center md:h-16">
          <BrandLogo size="header" priority />
        </Link>

        {/* Two search rows, never shown together, so Tab follows the visual order at every width: inline from
            768 px, and on phones a row under the bar that comes after the bar's actions. */}
        <div className="col-start-2 row-start-1 ml-7 hidden max-w-[680px] md:block">
          <Suspense fallback={<div className="h-11" />}>
            <GlobalSearch />
          </Suspense>
        </div>

        <div className="col-start-3 row-start-1 ml-3 flex items-center justify-end gap-1 sm:gap-2 md:ml-4">
          {layout.phoneSearch === "toggle" ? (
            <button
              ref={search.buttonRef}
              type="button"
              aria-expanded={search.open}
              aria-controls="busqueda-movil"
              aria-label="Buscar"
              onClick={search.toggle}
              className={cn(ICON_ENTRY, "md:hidden")}
            >
              <Search aria-hidden="true" />
            </button>
          ) : null}
          <Link
            href={sell.href}
            className={buttonClasses({ variant: "onDark", size: "sm", className: cn(SELL_HIT_AREA, publishing && "hidden md:inline-flex") })}
          >
            {sell.label}
          </Link>
          <AccountEntry publishing={publishing} />
        </div>

        {layout.phoneSearch !== "none" ? (
          <div
            ref={search.panelRef}
            id="busqueda-movil"
            className={cn("col-span-3 row-start-2 pb-3 md:hidden", !phoneSearchVisible && "hidden")}
          >
            <Suspense fallback={<div className="h-11" />}>
              <GlobalSearch id="busqueda-movil-campo" inputRef={inputRef} />
            </Suspense>
          </div>
        ) : null}
      </PageContainer>
    </header>
  );
}

// Signed out: "Ingresar". Signed in: the bell and the avatar that opens the account menu. Below 900 px both
// labels become icons with accessible names. Until the first account check settles, the entry keeps its place
// without showing a state that may be wrong.
function AccountEntry({ publishing }: { publishing: boolean }) {
  const account = useMarketplaceAccount();
  if (!account.authenticated) {
    const signIn = (
      <Link href="/login" className={cn(ICON_ENTRY, "-mr-3 min-[900px]:-mr-2.5 min-[900px]:px-2.5 min-[900px]:text-[14px] min-[900px]:font-semibold")}>
        <UserRound aria-hidden="true" />
        <span className="sr-only min-[900px]:not-sr-only">Ingresar</span>
      </Link>
    );
    if (account.settled) return signIn;
    return <>
      <span aria-hidden="true" className="invisible flex">{signIn}</span>
      <noscript>{signIn}</noscript>
    </>;
  }
  const unread = account.unreadNotifications;
  return (
    <>
      <Link
        href="/mi-cuenta/notificaciones"
        aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}
        className={cn(ICON_ENTRY, publishing && "hidden md:inline-flex")}
      >
        <Bell aria-hidden="true" />
        <CountBadge count={unread} className="absolute right-0.5 top-0.5" />
      </Link>
      <AccountMenu />
    </>
  );
}

// The account menu: the rail's sections, order and counts (lib/account-navigation.ts), "Admin" for admins, a
// divider and "Cerrar sesión".
function AccountMenu() {
  const account = useMarketplaceAccount();
  const pathname = usePathname();
  const menu = useDisclosure("account-menu");
  const accountType = account.storeOwner ? "store_owner" : "seller";
  const items = getAccountNavigationItems(accountType, account.hasStore);
  const monogram = account.name ? initials(account.name) : "";

  return (
    <div className="relative -mr-1.5 min-[900px]:-mr-2.5">
      <button
        ref={menu.buttonRef}
        type="button"
        aria-expanded={menu.open}
        aria-controls="menu-cuenta"
        onClick={menu.toggle}
        className="inline-flex h-11 items-center gap-2 rounded-control px-1.5 text-[14px] font-semibold text-surface transition-colors duration-120 hover:bg-white/10 min-[900px]:px-2.5"
      >
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-surface text-[12px] font-bold text-ink">
          {monogram || <UserRound className="h-4 w-4" />}
        </span>
        <span className="sr-only min-[900px]:not-sr-only">Mi cuenta</span>
      </button>
      <div
        ref={menu.panelRef}
        id="menu-cuenta"
        hidden={!menu.open}
        className="surface-light menu-fade absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-32px)] rounded-panel border border-subtle bg-surface p-2 text-ink shadow-level-1"
      >
        <div className="px-3 pb-2 pt-1">
          <p className="break-words t-ui font-semibold">{account.name || "Mi cuenta"}</p>
          <p className="t-meta">{accountRoleLabel(accountType)}</p>
        </div>
        <nav aria-label="Menú de cuenta" className="grid">
          <AccountSectionLinks
            compact
            items={items}
            pathname={pathname}
            counts={{ unreadNotifications: account.unreadNotifications, pendingBuyerConfirmations: account.pendingBuyerConfirmations }}
          />
          {account.admin ? (
            <Link href="/admin" className="flex min-h-11 items-center rounded-control px-3 t-ui font-semibold text-ink transition-colors duration-120 hover:bg-canvas md:min-h-9">
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="my-2 border-t border-subtle" />
        <AccountLogout compact />
      </div>
    </div>
  );
}
