import { ChevronLeft, ChevronRight } from "lucide-react";
import { CatalogLink } from "@/components/catalog-navigation";
import { formatNumber } from "@/lib/catalog-filters";
import { LISTINGS_PAGE_SIZE, pageHref } from "@/lib/pagination";
import { cn } from "@/lib/utils";

// The page numbers to show: the first, the last and the current page with its neighbours; a gap of more than one page
// becomes an ellipsis (1 … 4 5 6 … 11).
export function pageItems(page: number, pages: number): (number | "gap")[] {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((item) => item >= 1 && item <= pages).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (const item of shown) {
    const previous = items.at(-1);
    if (typeof previous === "number" && item - previous === 2) items.push(previous + 1);
    else if (typeof previous === "number" && item - previous > 2) items.push("gap");
    items.push(item);
  }
  return items;
}

const BOX = "inline-flex h-11 min-w-11 items-center justify-center rounded-control t-ui font-semibold tabular-nums md:h-10 md:min-w-10";

// Numbered pagination (UX-3 Q9): "Mostrando 1–24 de 262", then "Anterior", the numbers and "Siguiente". Crawlable
// ?page=N links built by pageHref, so filters are kept (REL-003); page 1 has no page parameter. Phones get 44 px
// numbers and icon-only arrows; desktop 40 px.
export function Pagination({
  page,
  total,
  path,
  params = {},
}: {
  page: number;
  total: number;
  path: string;
  params?: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / LISTINGS_PAGE_SIZE));
  if (total === 0) return null;
  const first = (page - 1) * LISTINGS_PAGE_SIZE + 1;
  const last = Math.min(page * LISTINGS_PAGE_SIZE, total);
  const href = (target: number) => pageHref(path, params, target);
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <p className="text-center t-meta">
        Mostrando {first === last ? formatNumber(first) : `${formatNumber(first)}–${formatNumber(last)}`} de {formatNumber(total)}
      </p>
      {pages > 1 ? (
        <nav aria-label="Páginas de resultados">
          <ul className="flex flex-wrap items-center justify-center gap-1">
            {page > 1 ? (
              <li>
                <CatalogLink href={href(Math.min(page - 1, pages))} className={cn(BOX, "gap-1 border border-line-strong px-2 text-ink hover:bg-canvas md:px-3")}>
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  <span className="sr-only md:hidden">Página anterior</span>
                  <span className="hidden md:inline">Anterior</span>
                </CatalogLink>
              </li>
            ) : null}
            {pageItems(page, pages).map((item, index) =>
              item === "gap" ? (
                <li key={`gap-${index}`} aria-hidden="true" className={cn(BOX, "min-w-6 text-ink-2 md:min-w-6")}>
                  …
                </li>
              ) : item === page ? (
                <li key={item}>
                  <span aria-current="page" className={cn(BOX, "bg-ink text-white")}>
                    <span className="sr-only">Página </span>
                    {item}
                  </span>
                </li>
              ) : (
                <li key={item}>
                  <CatalogLink href={href(item)} className={cn(BOX, "border border-line-strong text-ink hover:bg-canvas")}>
                    <span className="sr-only">Página </span>
                    {item}
                  </CatalogLink>
                </li>
              ),
            )}
            {page < pages ? (
              <li>
                <CatalogLink href={href(page + 1)} className={cn(BOX, "gap-1 border border-line-strong px-2 text-ink hover:bg-canvas md:px-3")}>
                  <span className="sr-only md:hidden">Página siguiente</span>
                  <span className="hidden md:inline">Siguiente</span>
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </CatalogLink>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
