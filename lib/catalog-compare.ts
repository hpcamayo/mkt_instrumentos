// FIND 12: the listings chosen for /comparar, from its address (?p=slug,slug): up to three valid, distinct slugs.
export function compareSlugs(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return [...new Set((raw ?? "").split(",").map((slug) => slug.trim()).filter((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 200))].slice(0, 3);
}
