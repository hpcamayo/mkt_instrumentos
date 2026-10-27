// Clean catalog pagination and category/product URLs stay discoverable. Refinements are noindex pages whose
// combinations can multiply without limit; apply the same hint in menus, chips and results navigation.
export function catalogRefinementRel(href: string): "nofollow" | undefined {
  const [path, query] = href.split("?", 2);
  if (path !== "/listados" || !query) return undefined;
  return [...new URLSearchParams(query).keys()].some((key) => key !== "page") ? "nofollow" : undefined;
}
