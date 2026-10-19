import { isListingPath } from "@/lib/shell";

// fast-01 (docs/ux-effortless/speed.md): which taps count as a page change and which pages get a skeleton when the
// change is slow. The component that draws the bar and the skeletons is components/navigation-feedback.tsx.

// The bar appears only if the next page is not there within 100 ms (anything faster reads as instant), the skeleton
// and the "Cargando…" announcement after one second (a skeleton that flashes on a fast load feels slower than none),
// and the bar gives up after 15 s, when the page change has most likely failed or was never one.
export const NAVIGATION_BAR_DELAY_MS = 100;
export const SLOW_NAVIGATION_MS = 1000;
export const NAVIGATION_GIVE_UP_MS = 15_000;

export type SkeletonKind = "listing" | "store" | "account";

export type LinkLike = { href: string; target?: string | null; download?: boolean };

// API routes and files answer in place (a download, an export); they never replace the page.
const NOT_A_PAGE = /^\/(api|_next)\/|\.(csv|xlsx?|pdf|zip|png|jpe?g|webp|gif|svg|txt|json|xml|webmanifest)$/i;

// The internal page a link opens, or null when following it does not change Laria's page: another site, a new tab,
// a download, a file, or the same page (a #section included).
export function linkNavigationTarget(link: LinkLike, here: URL): URL | null {
  if (link.download || (link.target && link.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(link.href, here);
  } catch {
    return null;
  }
  if (url.origin !== here.origin || NOT_A_PAGE.test(url.pathname)) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url;
}

// A search or filter form submitted with GET is a page change too.
export function formNavigationTarget(form: { method: string; action: string; target?: string | null }, query: URLSearchParams, here: URL): URL | null {
  if (form.method.toLowerCase() !== "get" || (form.target && form.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(form.action || here.href, here);
  } catch {
    return null;
  }
  if (url.origin !== here.origin || NOT_A_PAGE.test(url.pathname)) return null;
  url.search = query.toString();
  url.hash = "";
  return url.pathname === here.pathname && url.search === here.search ? null : url;
}

// The skeleton a slow page change shows, or null for the bar alone. Inside the account its own frame (the rail and
// the section switcher) stays on screen, so only arriving in it from elsewhere gets one. /vender and /publicar
// forward to the account's publishing pages.
export function skeletonKindFor(target: string, fromPathname: string): SkeletonKind | null {
  const pathname = target.split(/[?#]/)[0] || "/";
  if (isListingPath(pathname)) return "listing";
  if (/^\/tiendas\/[^/]+\/?$/.test(pathname)) return "store";
  const intoAccount = under(pathname, "/mi-cuenta") || pathname === "/vender" || pathname === "/publicar";
  return intoAccount && !under(fromPathname, "/mi-cuenta") ? "account" : null;
}

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
