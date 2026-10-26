import Link from "next/link";
import { Wrench } from "lucide-react";
import { ServiceCategoryIcon } from "@/components/services/service-card";
import { currentCondition } from "@/lib/listing-condition";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_INFO, SERVICES_PATH, serviceCategoryPath, serviceCountLabel } from "@/lib/services";
import { getServiceKindCounts, type ServiceKindCounts } from "@/lib/services-counts";
import { cn } from "@/lib/utils";

// feature-ideas services (bet-02): the ways into «Servicios para músicos» from the instrument side. They link to the
// section and never show a service among instruments (Henri: services are not mixed with items). Both stay out when
// there is nothing to show.

const countFormat = new Intl.NumberFormat("es-PE");

// The home, under the category chips: the kinds that have services, most first (up to four), with their counts, and
// "Ver servicios". One bordered row from 768 px, so it reads apart from the instrument chips; on phones the title line
// and one row of kinds that scrolls sideways.
export function HomeServicesTeaser({ counts }: { counts: ServiceKindCounts | null }) {
  if (!counts || counts.total === 0) return null;
  const kinds = SERVICE_CATEGORIES.filter((category) => counts.categories[category])
    .sort((a, b) => (counts.categories[b] ?? 0) - (counts.categories[a] ?? 0))
    .slice(0, 4);
  if (kinds.length === 0) return null;
  return (
    <section aria-labelledby="servicios-inicio" className="grid gap-2 rounded-panel border border-subtle px-4 py-3 md:flex md:items-center md:gap-6">
      <div className="flex items-center justify-between gap-4 md:contents">
        <h2 id="servicios-inicio" className="shrink-0 t-ui font-semibold text-ink">Servicios para músicos</h2>
        <Link href={SERVICES_PATH} className="link inline-flex min-h-6 shrink-0 items-center t-ui font-semibold md:order-last md:ml-auto">
          Ver servicios<span className="sr-only">: {serviceCountLabel(counts.total)}</span>
        </Link>
      </div>
      <ul className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:gap-x-6 md:gap-y-1 md:overflow-visible md:px-0">
        {kinds.map((category) => {
          const count = counts.categories[category] ?? 0;
          return (
            <li key={category} className="shrink-0">
              <Link href={serviceCategoryPath(category)} className="link inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap t-ui">
                <ServiceCategoryIcon category={category} className="h-4 w-4" />
                {SERVICE_CATEGORY_INFO[category].label}
                <span className="t-meta tabular-nums">
                  {countFormat.format(count)}
                  <span className="sr-only"> {count === 1 ? "servicio" : "servicios"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Worn or broken gear is where a luthier is obviously useful: "Bueno" (wear in sight), "Regular" (something to check)
// and "Para reparar". Every instrument category has someone who repairs it.
const REPAIR_CONDITIONS = new Set(["Bueno", "Regular", "Para reparar"]);

export function listingNeedsRepairLine(condition: string | null | undefined, sold: boolean) {
  const current = currentCondition(condition);
  return !sold && current !== null && REPAIR_CONDITIONS.has(current);
}

// The listing page, after the description: one quiet line to the repair shops, only for worn or broken gear and only
// while someone offers repairs. Streamed in its own Suspense boundary; the counts are shared, so it adds no query per
// view.
export async function ListingRepairLine({ condition, sold, className }: { condition: string | null; sold: boolean; className?: string }) {
  if (!listingNeedsRepairLine(condition, sold)) return null;
  const counts = await getServiceKindCounts();
  if (!counts?.categories.reparaciones) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 t-meta", className)}>
      <Wrench aria-hidden="true" className="h-4 w-4 shrink-0" />
      {currentCondition(condition) === "Para reparar" ? "¿Lo vas a reparar?" : "¿Necesita un ajuste o una reparación?"}
      <Link href={serviceCategoryPath("reparaciones")} className="link inline-flex min-h-6 items-center font-semibold">
        Ver luthiers y talleres
      </Link>
    </p>
  );
}
