import Link from "next/link";
import { LISTINGS_PAGE_SIZE, pageHref } from "@/lib/pagination";

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
  if (pages === 1 && page === 1) return null;
  return (
    <nav
      aria-label="Páginas de resultados"
      className="flex flex-wrap items-center justify-center gap-4 py-4 text-sm"
    >
      {page > 1 && (
        <Link
          className="laria-button-secondary px-4 py-2"
          href={pageHref(path, params, Math.min(page - 1, pages))}
        >
          Anterior
        </Link>
      )}
      <span aria-live="polite">
        Página {page} de {pages}
      </span>
      {page < pages && (
        <Link
          className="laria-button-secondary px-4 py-2"
          href={pageHref(path, params, page + 1)}
        >
          Siguiente
        </Link>
      )}
    </nav>
  );
}
