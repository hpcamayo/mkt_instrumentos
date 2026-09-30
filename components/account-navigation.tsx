"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import {
  Boxes,
  BarChart3,
  Bell,
  BellRing,
  Heart,
  CircleUserRound,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  ReceiptText,
  Settings,
  Store,
} from "lucide-react";
import { accountItemIsActive, getAccountNavigationItems, type AccountNavigationItem } from "@/lib/account-navigation";

type AccountType = "seller" | "store_owner";

export function AccountNavigation({
  accountType,
  hasStore,
  unreadNotifications,
  pendingBuyerConfirmations,
}: {
  accountType: AccountType;
  hasStore: boolean;
  unreadNotifications: number;
  pendingBuyerConfirmations: number;
}) {
  const pathname = usePathname();
  const items = getAccountNavigationItems(accountType, hasStore);
  const active = items.find((item) => accountItemIsActive(pathname, item)) ?? items[0];

  return (
    <>
      <details className="rounded-panel border border-subtle bg-white p-3 lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control px-2 font-semibold text-ink">
          <span>Cuenta · {active.label}</span>
          <span aria-hidden="true" className="t-ui text-ink-2 underline decoration-accent decoration-2 underline-offset-4">Menú</span>
        </summary>
        <nav aria-label="Menú de cuenta móvil" className="mt-3 grid gap-1 border-t border-subtle pt-3">
          <AccountLinks items={items} pathname={pathname} unreadNotifications={unreadNotifications} pendingBuyerConfirmations={pendingBuyerConfirmations} />
          <AccountLogout />
        </nav>
      </details>

      <aside className="hidden rounded-panel border border-subtle bg-white p-4 lg:sticky lg:top-24 lg:block lg:self-start">
        <div className="surface-frame rounded-control bg-frame p-4 text-white">
          <p className="t-micro text-muted-dark">
            {accountType === "store_owner" ? "Cuenta de Tienda" : "Cuenta Particular"}
          </p>
          <p className="mt-2 t-section">Mi cuenta</p>
          <p className="mt-2 t-ui text-muted-dark">
            {accountType === "store_owner"
              ? "Administra tu tienda y su inventario."
              : "Administra tu perfil y tus publicaciones."}
          </p>
        </div>
        <nav aria-label="Navegación de cuenta" className="mt-4 grid gap-1">
          <AccountLinks items={items} pathname={pathname} unreadNotifications={unreadNotifications} pendingBuyerConfirmations={pendingBuyerConfirmations} />
        </nav>
        <div className="mt-4 border-t border-subtle pt-4">
          <AccountLogout />
        </div>
      </aside>
    </>
  );
}

function AccountLinks({ items, pathname, unreadNotifications, pendingBuyerConfirmations }: { items: AccountNavigationItem[]; pathname: string; unreadNotifications: number; pendingBuyerConfirmations: number }) {
  return items.map((item) => {
    const active = accountItemIsActive(pathname, item);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={active
          ? "flex min-h-11 items-center gap-3 rounded-control bg-accent-tint px-3 py-2 t-ui font-semibold text-ink shadow-[inset_3px_0_0_var(--accent)]"
          : "flex min-h-11 items-center gap-3 rounded-control px-3 py-2 t-ui font-semibold text-ink-2 hover:bg-canvas hover:text-ink"}
      >
        <AccountIcon name={item.icon} />
        <span className="min-w-0 flex-1">{item.label}</span>
        {item.icon === "notifications" && unreadNotifications > 0 ? (
          <span aria-label={`${unreadNotifications} notificaciones sin leer`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-action px-1.5 text-[12px] font-bold leading-none tabular-nums text-action-ink">
            {unreadNotifications > 99 ? "99+" : unreadNotifications}
          </span>
        ) : null}
        {item.icon === "transactions" && pendingBuyerConfirmations > 0 ? (
          <span aria-label={`${pendingBuyerConfirmations} compras requieren tu confirmación`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-action px-1.5 text-[12px] font-bold leading-none tabular-nums text-action-ink">
            {pendingBuyerConfirmations > 99 ? "99+" : pendingBuyerConfirmations}
          </span>
        ) : null}
      </Link>
    );
  });
}

function AccountLogout() {
  return (
    <LogoutButton
      className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-canvas hover:text-ink"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Cerrar sesión
    </LogoutButton>
  );
}

function AccountIcon({ name }: { name: AccountNavigationItem["icon"] }) {
  const classes = "h-4 w-4";
  if (name === "favorites") return <Heart className={classes} aria-hidden="true" />;
  if (name === "summary") return <LayoutDashboard className={classes} aria-hidden="true" />;
  if (name === "listings") return <PackageSearch className={classes} aria-hidden="true" />;
  if (name === "publish") return <FilePlus2 className={classes} aria-hidden="true" />;
  if (name === "store") return <Store className={classes} aria-hidden="true" />;
  if (name === "inventory") return <Boxes className={classes} aria-hidden="true" />;
  if (name === "analytics") return <BarChart3 className={classes} aria-hidden="true" />;
  if (name === "transactions") return <ReceiptText className={classes} aria-hidden="true" />;
  if (name === "alerts") return <BellRing className={classes} aria-hidden="true" />;
  if (name === "notifications") return <Bell className={classes} aria-hidden="true" />;
  if (name === "profile") return <CircleUserRound className={classes} aria-hidden="true" />;
  return <Settings className={classes} aria-hidden="true" />;
}
