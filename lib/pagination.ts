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
