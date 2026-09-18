import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import logoClear from "@/app/logo-clear.svg";
import { PageContainer } from "@/components/page-container";
import { GlobalSearch } from "@/components/global-search";
import { SiteHeaderControls } from "@/components/site-header-controls";

export function SiteHeader() {
  return <header className="border-b border-white/10 bg-laria-black text-white">
    <PageContainer className="grid min-w-0 gap-3 py-4 lg:grid-cols-[auto_minmax(200px,1fr)_auto] lg:items-center lg:gap-6">
      <Link href="/" className="inline-flex w-fit items-center" aria-label="Laria inicio"><Image src={logoClear} alt="Laria" width={112} height={78} priority className="h-10 w-auto object-contain" /></Link>
      <Suspense fallback={<div className="h-11" />}><GlobalSearch /></Suspense>
      <SiteHeaderControls />
    </PageContainer>
  </header>;
}
