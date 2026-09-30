"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import type { AdminCounts } from "@/lib/admin";
import { buttonClasses } from "@/components/ui/button";

const links = [
  { href: "/admin", label: "Moderación" },
  { href: "/admin/publicaciones", label: "Publicaciones" },
  { href: "/admin/revisiones", label: "Cambios" },
  { href: "/admin/tiendas", label: "Tiendas" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/resenas", label: "Reseñas" },
  { href: "/admin/transacciones", label: "Transacciones" },
  { href: "/admin/legacy", label: "Vinculación legacy" },
] as const;

function AdminLinks({ onDark = false }: { onDark?: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegación administrativa" className="grid gap-1.5">
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
            className={
              active
                ? "rounded-control bg-accent px-3 py-2.5 t-ui font-semibold text-ink"
                : onDark
                  ? "rounded-control px-3 py-2.5 t-ui font-semibold text-muted-dark transition-colors duration-120 hover:bg-white/10 hover:text-white"
                  : "rounded-control px-3 py-2.5 t-ui font-semibold text-ink transition-colors duration-120 hover:bg-canvas"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
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

  return (
    <>
      <aside className="surface-frame hidden rounded-panel border border-white/10 bg-frame p-4 text-white lg:sticky lg:top-24 lg:block lg:self-start">
        <p className="t-micro text-muted-dark">
          Laria Admin
        </p>
        <p className="mt-2 t-section">Operaciones</p>
        <p className="mt-2 t-ui text-muted-dark">
          {total === null
            ? "Conteos pendientes no disponibles"
            : `${total} ${total === 1 ? "acción pendiente" : "acciones pendientes"}`}
        </p>
        <div className="mt-5">
          <AdminLinks onDark />
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="truncate t-meta text-muted-dark">{userName}</p>
          <LogoutButton className={buttonClasses({ variant: "onDark", size: "sm", block: true, className: "mt-3" })} />
        </div>
      </aside>

      <details className="rounded-panel border border-subtle bg-white p-3 lg:hidden">
        <summary className="cursor-pointer list-none rounded-control px-2 py-2 t-ui font-semibold text-ink">
          Menú Admin · {total === null ? "conteos no disponibles" : `${total} pendiente${total === 1 ? "" : "s"}`}
        </summary>
        <div className="mt-2 border-t border-subtle pt-3">
          <AdminLinks />
          <LogoutButton className={buttonClasses({ variant: "secondary", block: true, className: "mt-3" })} />
        </div>
      </details>
    </>
  );
}
