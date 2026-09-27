"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import type { AdminCounts } from "@/lib/admin";

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
                ? "rounded-md border border-laria-blue/35 bg-laria-blue px-3 py-2.5 text-sm font-black text-laria-black outline-none focus-visible:ring-2 focus-visible:ring-white"
                : onDark
                  ? "rounded-md border border-transparent px-3 py-2.5 text-sm font-bold text-white/75 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-laria-blue"
                  : "rounded-md border border-transparent px-3 py-2.5 text-sm font-bold text-laria-ink outline-none transition hover:bg-laria-blue/10 focus-visible:ring-2 focus-visible:ring-laria-blue"
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
      <aside className="hidden rounded-lg border border-white/10 bg-laria-black p-4 text-white shadow-[0_18px_48px_rgb(5_6_8/0.22)] lg:sticky lg:top-24 lg:block lg:self-start">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-yellow">
          Laria Admin
        </p>
        <p className="mt-2 text-xl font-black">Operaciones</p>
        <p className="mt-2 text-sm leading-6 text-white/65">
          {total === null
            ? "Conteos pendientes no disponibles"
            : `${total} ${total === 1 ? "acción pendiente" : "acciones pendientes"}`}
        </p>
        <div className="mt-5">
          <AdminLinks onDark />
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="truncate text-xs text-white/60">{userName}</p>
          <LogoutButton className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-white/20 px-4 py-2 text-sm font-black text-white transition hover:border-laria-blue hover:text-laria-blue" />
        </div>
      </aside>

      <details className="rounded-lg border border-laria-fog bg-white p-3 shadow-sm lg:hidden">
        <summary className="cursor-pointer list-none rounded-md px-2 py-2 text-sm font-black text-laria-ink outline-none focus-visible:ring-2 focus-visible:ring-laria-blue">
          Menú Admin · {total === null ? "conteos no disponibles" : `${total} pendiente${total === 1 ? "" : "s"}`}
        </summary>
        <div className="mt-2 border-t border-laria-fog pt-3">
          <AdminLinks />
          <LogoutButton className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-laria-steel px-4 py-2 text-sm font-black text-laria-ink" />
        </div>
      </details>
    </>
  );
}
