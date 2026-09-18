"use client";
import Link from "next/link";
import { getHeaderNavigation } from "@/lib/account-navigation";
import { SiteHeaderAccountNav } from "@/components/site-header-account-nav";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";

export function SiteHeaderControls() {
  const state = useMarketplaceAccount();
  return <nav aria-label="Navegación principal"><ul className="flex flex-wrap items-center justify-end gap-1 text-sm font-semibold text-white/75">
    {getHeaderNavigation(state).filter((item) => item.label !== "Inicio" && item.label !== "Listados").map((item) => <li key={item.href}><Link href={item.href} className="inline-flex min-h-11 items-center rounded-md px-3 py-2 hover:bg-white/10 hover:text-white">{item.label}</Link></li>)}
    <SiteHeaderAccountNav authenticated={state.authenticated} storeOwner={state.storeOwner} />
  </ul></nav>;
}
