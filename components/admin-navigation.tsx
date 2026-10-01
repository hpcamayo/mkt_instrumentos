"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import { useDisclosure } from "@/components/use-disclosure";
import { CountBadge } from "@/components/ui/tag";
import type { AdminCounts } from "@/lib/admin";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Moderación" },
  { href: "/admin/publicaciones", label: "Publicaciones" },
  { href: "/admin/revisiones", label: "Cambios" },
  { href: "/admin/tiendas", label: "Tiendas" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/resenas", label: "Reseñas" },
  { href: "/admin/transacciones", label: "Transacciones" },
  { href: "/admin/legacy", label: "Publicaciones históricas" },
] as const;

// "Moderación" carries the total of the moderation queues; the other sections are record views without a
// pending count of their own.
function AdminLinks({ total }: { total: number | null }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegación administrativa" className="grid gap-0.5">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-control px-3 t-ui font-semibold text-surface transition-colors duration-120",
              active ? "bg-frame-2 shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-white/10",
            )}
          >
            <span className="min-w-0 flex-1">{link.label}</span>
            {link.href === "/admin" && total !== null ? (
              <CountBadge count={total} label={`${total} ${total === 1 ? "acción pendiente" : "acciones pendientes"}`} />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function AdminMark() {
  return (
    <Link href="/" aria-label="Laria inicio" className="flex w-fit items-center gap-3">
      <BrandLogo size="admin" />
      <span className="t-micro text-muted-dark">Admin</span>
    </Link>
  );
}

function AdminUser({ userName }: { userName: string }) {
  return (
    <div className="border-t border-white/10 pt-4">
      <div className="px-3">
        <p className="truncate t-ui font-semibold text-surface">{userName}</p>
        <p className="t-meta text-muted-dark">Administrador</p>
      </div>
      <LogoutButton className="mt-2 flex min-h-11 w-full items-center rounded-control px-3 text-left t-ui font-semibold text-muted-dark transition-colors duration-120 hover:bg-white/10 hover:text-surface" />
    </div>
  );
}

export function AdminNavigation({
  counts,
  userName,
}: {
  counts: AdminCounts | null;
  userName: string;
}) {
  const total = counts
    ? Object.values(counts).reduce((sum, value) => sum + value, 0)
    : null;
  const menu = useDisclosure("admin-menu");

  return (
    <>
      {/* The black column runs the page's full height; its content fills the first screen, so the admin's name
          sits at the bottom of the viewport on load while everything scrolls with the page (N3). */}
      <aside className="surface-frame hidden bg-frame text-surface lg:block">
        <div className="flex min-h-screen flex-col gap-6 px-3 py-5">
          <div className="px-3"><AdminMark /></div>
          <AdminLinks total={total} />
          <div className="mt-auto"><AdminUser userName={userName} /></div>
        </div>
      </aside>

      <div className="surface-frame bg-frame text-surface lg:hidden">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <AdminMark />
          <button
            ref={menu.buttonRef}
            type="button"
            aria-expanded={menu.open}
            aria-controls="menu-admin"
            onClick={menu.toggle}
            className="-mr-2.5 inline-flex h-11 items-center gap-2 rounded-control px-2.5 t-ui font-semibold text-surface transition-colors duration-120 hover:bg-white/10"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
            Menú
            {total !== null ? <CountBadge count={total} label={`${total} ${total === 1 ? "acción pendiente" : "acciones pendientes"}`} /> : null}
          </button>
        </div>
        <div ref={menu.panelRef} id="menu-admin" hidden={!menu.open} className="menu-fade border-t border-white/10 px-2 pb-4 pt-2 sm:px-4">
          <AdminLinks total={total} />
          <div className="mt-3"><AdminUser userName={userName} /></div>
        </div>
      </div>
    </>
  );
}
