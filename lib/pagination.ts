export const LISTINGS_PAGE_SIZE = 24;

export function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
}

export function pageHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
  page: number,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value])
      query.append(key, item);
  }
  if (page > 1) query.set("page", String(page));
  return query.size ? `${path}?${query}` : path;
}

// PostgREST returns 416 before supplying a count when the offset is past the end.
export function getPageRedirect(
  page: number,
  count: number | null,
  error: { code: string } | null,
) {
  if (error?.code === "PGRST103" && page > 1) return 1;
  if (error || count === null) return null;
  const lastPage = Math.max(1, Math.ceil(count / LISTINGS_PAGE_SIZE));
  return page > lastPage ? lastPage : null;
}
