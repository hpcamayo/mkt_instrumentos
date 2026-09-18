"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  BarChart3,
  Bell,
  Heart,
  CircleUserRound,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  Settings,
  Store,
} from "lucide-react";
import { accountItemIsActive, getAccountNavigationItems, type AccountNavigationItem } from "@/lib/account-navigation";

type AccountType = "seller" | "store_owner";

export function AccountNavigation({
  accountType,
  hasStore,
  unreadNotifications,
}: {
  accountType: AccountType;
  hasStore: boolean;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  const items = getAccountNavigationItems(accountType, hasStore);
  const active = items.find((item) => accountItemIsActive(pathname, item)) ?? items[0];

  return (
    <>
      <details className="rounded-lg border border-laria-fog bg-white p-3 shadow-sm lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 font-black text-laria-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laria-blue">
          <span>Cuenta · {active.label}</span>
          <span aria-hidden="true" className="text-laria-blue">Menú</span>
        </summary>
        <nav aria-label="Menú de cuenta móvil" className="mt-3 grid gap-1 border-t border-laria-fog pt-3">
          <AccountLinks items={items} pathname={pathname} unreadNotifications={unreadNotifications} />
          <LogoutLink />
        </nav>
      </details>

      <aside className="hidden rounded-lg border border-laria-fog bg-white p-4 shadow-[0_16px_36px_rgb(16_18_23/0.06)] lg:sticky lg:top-24 lg:block lg:self-start">
        <div className="rounded-md bg-laria-black p-4 text-white">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-laria-yellow">
            {accountType === "store_owner" ? "Cuenta de Tienda" : "Cuenta Particular"}
          </p>
          <p className="mt-2 text-2xl font-black">Mi cuenta</p>
          <p className="mt-2 text-sm leading-6 text-white/70">
            {accountType === "store_owner"
              ? "Administra tu tienda y su inventario."
              : "Administra tu perfil y tus publicaciones."}
          </p>
        </div>
        <nav aria-label="Navegación de cuenta" className="mt-4 grid gap-1">
          <AccountLinks items={items} pathname={pathname} unreadNotifications={unreadNotifications} />
        </nav>
        <div className="mt-4 border-t border-laria-fog pt-4">
          <LogoutLink />
        </div>
      </aside>
    </>
  );
}

function AccountLinks({ items, pathname, unreadNotifications }: { items: AccountNavigationItem[]; pathname: string; unreadNotifications: number }) {
  return items.map((item) => {
    const active = accountItemIsActive(pathname, item);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={active
          ? "flex min-h-11 items-center gap-3 rounded-md border border-laria-blue/35 bg-laria-blue/10 px-3 py-2 text-sm font-black text-laria-blue"
          : "flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-bold text-laria-text-soft hover:border-laria-fog hover:text-laria-blue"}
      >
        <AccountIcon name={item.icon} />
        <span className="min-w-0 flex-1">{item.label}</span>
        {item.icon === "notifications" && unreadNotifications > 0 ? (
          <span aria-label={`${unreadNotifications} notificaciones sin leer`} className="min-w-6 rounded-full bg-laria-yellow px-2 py-0.5 text-center text-[11px] font-black text-laria-black">
            {unreadNotifications > 99 ? "99+" : unreadNotifications}
          </span>
        ) : null}
      </Link>
    );
  });
}

function LogoutLink() {
  return (
    <Link
      href="/logout"
      prefetch={false}
      className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-bold text-laria-text-soft hover:bg-laria-cloud hover:text-laria-ink"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Cerrar sesión
    </Link>
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
  if (name === "notifications") return <Bell className={classes} aria-hidden="true" />;
  if (name === "profile") return <CircleUserRound className={classes} aria-hidden="true" />;
  return <Settings className={classes} aria-hidden="true" />;
}
