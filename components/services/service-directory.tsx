import Link from "next/link";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageContainer } from "@/components/page-container";
import { Pagination } from "@/components/pagination";
import { SERVICE_GRID, ServiceCard, ServiceCategoryIcon } from "@/components/services/service-card";
import { Button } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_INFO,
  SERVICE_PAGE_SIZE,
  SERVICES_PATH,
  hasServiceRefinements,
  placeKey,
  readServicePage,
  serviceCategoryPath,
  serviceCountLabel,
  serviceDirectoryHref,
  serviceDirectoryParams,
  serviceModalityLabel,
  serviceRpcFilters,
  serviceSkillLabel,
  type ServiceCategory,
  type ServiceFilters,
  type ServiceSort,
} from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { getRequestReads } from "@/lib/supabase/public-read-client";

const SORT_LABELS: Record<ServiceSort, string> = { recientes: "Más recientes", valorados: "Mejor valorados", precio: "Menor precio" };

type Counts = { total: number; categories: Partial<Record<ServiceCategory, number>>; cities: { city: string; count: number }[] };

function readCounts(value: unknown): Counts {
  const row = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const categories = typeof row.categories === "object" && row.categories !== null ? (row.categories as Record<string, number>) : {};
  const cities = Array.isArray(row.cities) ? row.cities.filter((item): item is { city: string; count: number } => typeof item?.city === "string" && typeof item?.count === "number") : [];
  return { total: typeof row.total === "number" ? row.total : 0, categories, cities };
}

// bet-02 (docs/feature-ideas/services.md): "Servicios para músicos", its own section apart from the instruments. The
// page lists approved services, newest approval first, 24 a page, with the category, city, place of service, what
// they teach or repair, and the order as links (each filtered page is noindex, follow). Contact and payment are
// between the musician and the provider; Laria never charges or takes part.
export async function ServiceDirectory({ filters, page }: { filters: ServiceFilters; page: number }) {
  const { supabase } = getRequestReads();
  if (!supabase) warnMissingSupabaseEnv();
  const category = filters.category;
  const info = category ? SERVICE_CATEGORY_INFO[category] : null;
  const [result, countsResult] = supabase
    ? await Promise.all([
        servicesDb(supabase).rpc("get_public_services", { p_filters: serviceRpcFilters(filters), p_page: page, p_page_size: SERVICE_PAGE_SIZE }),
        servicesDb(supabase).rpc("get_service_directory_counts", { p_category: category ?? null }),
      ])
    : [null, null];
  const failed = !result || Boolean(result.error);
  if (result?.error) console.error("Services directory failed", result.error.message);
  const { total, items } = readServicePage(result?.data);
  const counts = readCounts(countsResult?.data);
  const lastPage = Math.max(1, Math.ceil(total / SERVICE_PAGE_SIZE));
  if (!failed && page > lastPage) redirect(serviceDirectoryHref(filters, lastPage));

  return (
    <section className="bg-surface">
      <PageContainer className="py-6 lg:py-8">
        <Breadcrumbs
          items={info ? [{ label: "Inicio", href: "/" }, { label: "Servicios para músicos", href: SERVICES_PATH }, { label: info.label }] : [{ label: "Inicio", href: "/" }, { label: "Servicios para músicos" }]}
          className="mb-3"
        />
        <h1 className="t-page text-ink">{info ? info.label : "Servicios para músicos"}</h1>
        <p className="text-lead mt-2 max-w-[68ch] t-body text-ink-2">
          {info ? `${info.blurb} ` : "Profesores, luthiers y talleres, salas de ensayo, estudios de grabación y sonido para eventos. "}
          Escríbeles por WhatsApp y acuerda el precio, el horario y el pago directamente con ellos: Laria no cobra ni
          participa en el pago.
        </p>

        <nav aria-label="Tipos de servicio" className="mt-5">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            <li className="shrink-0">
              <ChipLink href={SERVICES_PATH} selected={!category} current="page">
                Todos <span className="t-meta tabular-nums">{counts.total}</span>
              </ChipLink>
            </li>
            {SERVICE_CATEGORIES.map((key) => (
              <li key={key} className="shrink-0">
                <ChipLink href={serviceCategoryPath(key)} selected={category === key} current="page">
                  {SERVICE_CATEGORY_INFO[key].label} <span className="t-meta tabular-nums">{counts.categories[key] ?? 0}</span>
                </ChipLink>
              </li>
            ))}
          </ul>
        </nav>

        {!supabase || failed ? (
          <Notice tone="danger" role="alert" className="mt-5">No pudimos cargar los servicios. Vuelve a intentarlo en unos minutos.</Notice>
        ) : counts.total === 0 && !hasServiceRefinements(filters) && !category ? (
          <EmptyState
            className="mt-5"
            title="Aún no hay servicios publicados"
            description="Aquí aparecerán profesores, talleres, salas y estudios cuando Laria apruebe sus perfiles."
            actions={<Button href="/mi-cuenta/servicios/nuevo" variant="secondary">Ofrecer un servicio</Button>}
          />
        ) : (
          <div className="mt-5 grid gap-5">
            <ServiceRefinements filters={filters} cities={counts.cities} />
            <p className="t-meta tabular-nums" id="servicios-estado">
              {serviceCountLabel(total)}
              {filters.city ? ` en ${filters.city}` : ""} · {SORT_LABELS[filters.sort]}
            </p>
            {items.length === 0 ? (
              <EmptyState
                title={category ? `Aún no hay ${SERVICE_CATEGORY_INFO[category].label.toLocaleLowerCase("es-PE")} con estos filtros` : "No hay servicios con estos filtros"}
                description="Quita un filtro o mira otra ciudad."
                actions={<Button href={category ? serviceCategoryPath(category) : SERVICES_PATH} variant="secondary">Quitar filtros</Button>}
              />
            ) : (
              <ul className={SERVICE_GRID}>
                {items.map((service, index) => (
                  <li key={service.id} className="min-w-0">
                    <ServiceCard service={service} eager={index < 3} />
                  </li>
                ))}
              </ul>
            )}
            <Pagination page={page} total={total} path={category ? serviceCategoryPath(category) : SERVICES_PATH} params={serviceDirectoryParams(filters)} />
          </div>
        )}

        <aside className="mt-8 flex flex-col gap-3 rounded-panel bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div className="flex items-start gap-3">
            <ServiceCategoryIcon category={category ?? "clases"} className="mt-0.5 h-6 w-6 shrink-0" />
            <div>
              <h2 className="t-card-title text-ink">¿Das clases, reparas instrumentos o tienes una sala o estudio?</h2>
              <p className="mt-1 t-ui text-ink-2">Publica tu servicio gratis: los músicos te escriben directo por WhatsApp.</p>
            </div>
          </div>
          <Link href="/mi-cuenta/servicios/nuevo" className="link inline-flex min-h-6 w-fit shrink-0 items-center t-ui font-semibold">
            Ofrecer un servicio
          </Link>
        </aside>
      </PageContainer>
    </section>
  );
}

// The refinements as links, so each choice has its own address: city (the cities with services, most first), where the
// service happens, what they teach or repair, and the order. A chosen chip removes its filter when pressed.
function ServiceRefinements({ filters, cities }: { filters: ServiceFilters; cities: { city: string; count: number }[] }) {
  const category = filters.category;
  const info = category ? SERVICE_CATEGORY_INFO[category] : null;
  const modalities = info ? info.modalities : (["en_local", "a_domicilio", "en_linea"] as const);
  const cityKey = filters.city ? placeKey(filters.city) : null;
  const shownCities = cityKey && !cities.some((item) => placeKey(item.city) === cityKey) ? [{ city: filters.city as string, count: 0 }, ...cities] : cities;
  const groups: { label: string; chips: { key: string; label: string; selected: boolean; href: string }[] }[] = [];
  if (shownCities.length > 1 || filters.city) {
    groups.push({
      label: "Ciudad",
      chips: shownCities.map((item) => {
        const selected = placeKey(item.city) === cityKey;
        return { key: item.city, label: item.city, selected, href: serviceDirectoryHref({ ...filters, city: selected ? undefined : item.city }) };
      }),
    });
  }
  if (modalities.length > 1) {
    groups.push({
      label: "Dónde",
      chips: modalities.map((modality) => {
        const selected = filters.modality === modality;
        return { key: modality, label: serviceModalityLabel(modality, category), selected, href: serviceDirectoryHref({ ...filters, modality: selected ? undefined : modality }) };
      }),
    });
  }
  if (info?.skills.length && info.skillsFilterLabel) {
    groups.push({
      label: info.skillsFilterLabel,
      chips: info.skills.map((skill) => {
        const selected = filters.skill === skill;
        return { key: skill, label: serviceSkillLabel(skill), selected, href: serviceDirectoryHref({ ...filters, skill: selected ? undefined : skill }) };
      }),
    });
  }
  groups.push({
    label: "Orden",
    chips: (Object.keys(SORT_LABELS) as ServiceSort[]).map((sort) => ({
      key: sort,
      label: SORT_LABELS[sort],
      selected: filters.sort === sort,
      href: serviceDirectoryHref({ ...filters, sort }),
    })),
  });
  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <nav key={group.label} aria-label={group.label} className="grid gap-1.5 md:grid-cols-[120px_1fr] md:items-center md:gap-3">
          <p className="t-ui font-semibold text-ink">{group.label}</p>
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {group.chips.map((chip) => (
              <li key={chip.key} className="shrink-0">
                <ChipLink href={chip.href} selected={chip.selected} scroll={false}>{chip.label}</ChipLink>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}
