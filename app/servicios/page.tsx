import type { Metadata } from "next";
import { ServiceDirectory } from "@/components/services/service-directory";
import { parsePage } from "@/lib/pagination";
import { buildServiceDirectoryMetadata } from "@/lib/services-metadata";
import { parseServiceFilters } from "@/lib/services";

export const dynamic = "force-dynamic";
// A hard stop well past the read budgets (lib/request-deadline.ts), far below Vercel's 300 s default.
export const maxDuration = 30;

type ServicesPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: ServicesPageProps): Promise<Metadata> {
  const resolved = await searchParams;
  return buildServiceDirectoryMetadata(parseServiceFilters(resolved), parsePage(resolved.page));
}

// bet-02 (docs/feature-ideas/services.md): every service for musicians, apart from the instruments.
export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const resolved = await searchParams;
  return <ServiceDirectory filters={parseServiceFilters(resolved)} page={parsePage(resolved.page)} />;
}
