"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, type Ref } from "react";
import { Bell, ChevronDown, Search, UserRound } from "lucide-react";
import { AccountLogout, AccountSectionLinks } from "@/components/account-navigation";
import { BrandLogo } from "@/components/brand-logo";
import { GlobalSearch } from "@/components/global-search";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { PageContainer } from "@/components/page-container";
import { useDisclosure } from "@/components/use-disclosure";
import { buttonClasses } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/tag";
import { accountRoleLabel, getAccountNavigationItems, getSellEntry } from "@/lib/account-navigation";
import { CATALOG_PATH, VERIFIED_STORES_PATH, categoryMenus, type ShellLayout } from "@/lib/shell";
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

// The home header (docs/ux-redesign/ux-3-discovery.md § Home header, N12, Q14): the same black bar with the logo,
// then "Categorías" (a disclosure menu that replaces the category strip on the home), "Tiendas verificadas" from 768 px
// and "Cómo funciona" from 1024 px; "Vender" and the account entry on the right. No search in the bar and no phone
// search row: the banner has the search.
const HOME_ITEM = "inline-flex h-11 items-center whitespace-nowrap rounded-control px-2 text-[14px] font-semibold leading-5 text-surface transition-colors duration-120 hover:bg-white/10";

export function HomeHeader() {
  const account = useMarketplaceAccount();
  const sell = getSellEntry(account);
  const menu = useDisclosure("home-categories");

  return (
    <header className="surface-frame relative bg-frame text-surface">
      <PageContainer className="flex h-14 items-center md:h-16">
        <Link href="/" aria-label="Laria inicio" className="flex h-full w-fit shrink-0 items-center">
          <BrandLogo size="header" priority />
        </Link>
        {/* 20 px plus the items' 8 px padding: the first label sits 28 px after the logo. */}
        <nav aria-label="Navegación principal" className="ml-5 flex min-w-0 items-center gap-1.5">
          <button
            ref={menu.buttonRef}
            type="button"
            aria-expanded={menu.open}
            aria-controls="menu-categorias"
            onClick={menu.toggle}
            className={cn(HOME_ITEM, "gap-1", menu.open && "bg-white/10")}
          >
            Categorías
            <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", menu.open && "rotate-180")} />
          </button>
          {/* Rendered only while open, right after its button, so Tab goes from the button into the panel. */}
          {menu.open ? <HomeCategoryPanel panelRef={menu.panelRef} onChoose={() => menu.close()} /> : null}
          <Link href={VERIFIED_STORES_PATH} className={cn(HOME_ITEM, "hidden md:inline-flex")}>Tiendas verificadas</Link>
          <Link href="#como-funciona" className={cn(HOME_ITEM, "hidden lg:inline-flex")}>Cómo funciona</Link>
        </nav>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-1 pl-3 sm:gap-2">
          <Link href={sell.href} className={buttonClasses({ variant: "onDark", size: "sm", className: SELL_HIT_AREA })}>
            {sell.label}
          </Link>
          <AccountEntry publishing={false} />
        </div>
      </PageContainer>
    </header>
  );
}

// "Todos los instrumentos", every category (its name opens its landing) with its canonical types, and "Tiendas
// verificadas": the strip's destinations (lib/shell.ts categoryMenus, PUB-011–015). From 768 px a white panel across
// the page under the bar, the categories in four columns of two rows, 36 px rows; on phones one stacked list with
// 44 px rows, the types indented, scrolling inside the panel.
const PANEL_ROW = "-mx-2 flex min-h-11 items-center rounded-control px-2 t-ui transition-colors duration-120 hover:bg-canvas md:min-h-9";

function HomeCategoryPanel({ panelRef, onChoose }: { panelRef: Ref<HTMLDivElement>; onChoose: () => void }) {
  return (
    <div
      ref={panelRef}
      id="menu-categorias"
      className="surface-light menu-fade absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-56px)] overflow-y-auto border-b border-line-deco bg-surface text-ink shadow-level-1 md:max-h-none md:overflow-visible"
    >
      <PageContainer className="py-2 md:py-6">
        <Link href={CATALOG_PATH} onClick={onChoose} className={cn(PANEL_ROW, "font-semibold")}>Todos los instrumentos</Link>
        <ul className="mt-2 grid border-y border-subtle py-2 md:mt-3 md:grid-cols-4 md:gap-x-8 md:gap-y-5 md:py-5">
          {categoryMenus.map((category) => (
            <li key={category.key}>
              <Link href={category.href} onClick={onChoose} className={cn(PANEL_ROW, "font-semibold")}>{category.label}</Link>
              <ul>
                {category.types.map((type) => (
                  <li key={type.value}>
                    <Link href={type.href} onClick={onChoose} className={cn(PANEL_ROW, "pl-6 text-ink-2 hover:text-ink md:pl-2")}>{type.label}</Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <Link href={VERIFIED_STORES_PATH} onClick={onChoose} className={cn(PANEL_ROW, "mt-2 font-semibold md:mt-3")}>Tiendas verificadas</Link>
      </PageContainer>
    </div>
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
