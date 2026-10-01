import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { AdminNavigation } from "@/components/admin-navigation";
import { getAdminCounts, requireAdmin } from "@/lib/admin-server";

// Private account/Admin surfaces are never indexable.
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

// The Admin frame (docs/ux-redesign/ux-2-shell.md): no site header or footer; a 240 px black sidebar on
// desktop, a black bar with a menu button below 1024 px, content on canvas. The workbench itself is UX-7.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [{ user, profile }, counts] = await Promise.all([
    requireAdmin(),
    getAdminCounts(),
  ]);

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <AdminNavigation
        counts={counts}
        userName={profile?.full_name || user.email || "Administración"}
      />
      <main id="contenido" tabIndex={-1} className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
