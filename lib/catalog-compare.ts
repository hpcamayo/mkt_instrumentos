// FIND 12: the listings chosen for /comparar, from the private URL fragment (#p=slug,slug): up to three valid, distinct slugs.
export function compareSlugs(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return [...new Set((raw ?? "").split(",").map((slug) => slug.trim()).filter((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 200))].slice(0, 3);
}

export function compareHref(slugs: readonly string[]) {
  return `/comparar#${new URLSearchParams({ p: slugs.join(",") })}`;
}
