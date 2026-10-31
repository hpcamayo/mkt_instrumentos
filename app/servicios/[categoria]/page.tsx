import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceDirectory } from "@/components/services/service-directory";
import { parsePage } from "@/lib/pagination";
import { buildServiceDirectoryMetadata } from "@/lib/services-metadata";
import { parseServiceFilters, serviceCategoryFromSlug } from "@/lib/services";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ServiceCategoryPageProps = {
  params: Promise<{ categoria: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: ServiceCategoryPageProps): Promise<Metadata> {
  const [{ categoria }, resolved] = await Promise.all([params, searchParams]);
  const category = serviceCategoryFromSlug(categoria);
  if (!category) return {};
  return buildServiceDirectoryMetadata(parseServiceFilters(resolved, category), parsePage(resolved.page));
}

// bet-02: one kind of service (/servicios/clases, /servicios/salas-de-ensayo…), with what they teach or repair.
export default async function ServiceCategoryPage({ params, searchParams }: ServiceCategoryPageProps) {
  const [{ categoria }, resolved] = await Promise.all([params, searchParams]);
  const category = serviceCategoryFromSlug(categoria);
  if (!category) notFound();
  return <ServiceDirectory filters={parseServiceFilters(resolved, category)} page={parsePage(resolved.page)} />;
}
