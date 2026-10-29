"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { GlobalCategories } from "@/components/global-categories";
import { HomeHeader, SiteHeader } from "@/components/site-header";
import type { ListingCounts } from "@/lib/catalog-brands";
import { getShellLayout } from "@/lib/shell";

// Chooses the frame for the current route (lib/shell.ts). The footers are server-rendered and passed in, so
// only the header and the strip ship as client code. Admin draws its own frame and its own <main>.
export function SiteShell({
  children,
  fullFooter,
  slimFooter,
  menuBrands = {},
  menuCounts = null,
}: {
  children: ReactNode;
  fullFooter: ReactNode;
  slimFooter: ReactNode;
  // Listing category → the brands its strip panel lists (lib/catalog-brands.ts, read by the root layout).
  menuBrands?: Record<string, string[]>;
  menuCounts?: ListingCounts | null;
}) {
  const layout = getShellLayout(usePathname());
  if (layout.header === "none") return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col">
      {/* Two components, not a prop: the home header and the standard header keep their own state and hooks. */}
      {layout.header === "home" ? <HomeHeader counts={menuCounts} /> : <SiteHeader layout={layout} />}
      {layout.strip !== "none" ? <GlobalCategories visibility={layout.strip} brands={menuBrands} counts={menuCounts} /> : null}
      <main id="contenido" tabIndex={-1} className="flex-1">
        <RouteContent>{children}</RouteContent>
      </main>
      {layout.footer === "full" ? fullFooter : layout.footer === "slim" ? slimFooter : null}
    </div>
  );
}

// Keep the streamed route in a component fiber before React starts resolving its lazy RSC children.
// Suspending directly while reconciling <main> left its server-rendered children unclaimed (React #418).
// This adds no streaming fallback, so server redirects and not-found responses keep their HTTP status.
function RouteContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Admin pages get their <main> from app/admin/layout.tsx. A 404 or an error that Next renders outside that layout
// (an unmatched /admin/… URL, or a crash in the Admin layout itself) would have none, so the root not-found and error
// pages wrap their body in this; everywhere else the shell already provides the <main>.
export function FallbackMain({ children }: { children: ReactNode }) {
  const layout = getShellLayout(usePathname());
  if (layout.header !== "none") return <>{children}</>;
  return <main id="contenido" tabIndex={-1} className="min-h-screen">{children}</main>;
}
