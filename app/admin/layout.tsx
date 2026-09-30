import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { AdminNavigation } from "@/components/admin-navigation";
import { getAdminCounts, requireAdmin } from "@/lib/admin-server";

// Private account/Admin surfaces are never indexable.
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [{ user, profile }, counts] = await Promise.all([
    requireAdmin(),
    getAdminCounts(),
  ]);

  return (
    <div className="min-h-screen bg-laria-cloud/70">
      <div className="mx-auto grid w-full max-w-[1600px] gap-4 px-3 py-5 sm:px-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-5 lg:px-5 xl:px-6">
        <AdminNavigation
          counts={counts}
          userName={profile?.full_name || user.email || "Administración"}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
