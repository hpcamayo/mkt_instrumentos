import type { Metadata } from "next";
import { DescubrirFeed, type FeedPage } from "@/components/descubrir/descubrir-feed";
import { getDescubrirPage } from "@/lib/catalog-data";
import {
  NEW_WINDOW_DAYS,
  SPARSE_MINIMUM,
  SPARSE_WINDOW_DAYS,
  exitHref,
  feedTitle,
  limaDay,
  readDescubrirRequest,
  windowStart,
  type DescubrirItem,
} from "@/lib/descubrir";
import { warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const dynamic = "force-dynamic";
// A hard stop well past the read budgets (lib/request-deadline.ts), far below Vercel's 300 s default.
export const maxDuration = 30;

export const metadata: Metadata = { title: "Descubrir", robots: NOINDEX_ROBOTS };

type DescubrirPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Descubrir (big-02, docs/ux-effortless/maybes-descubrir.md): one listing per screen. "Lo nuevo" (no parameters, the
// home's entry) shows the listings published in the last 7 Lima days, or 30 when the week holds fewer than 12;
// "?modo=resultados&…" (a results list's "Ver en Descubrir") shows that list, with its filters and order. The first
// page comes from the server with every photo, so the first screen draws at once; the feed asks for the rest. A failed
// read leaves the first page to the browser, which says so and offers to try again.
export default async function DescubrirPage({ searchParams }: DescubrirPageProps) {
  const { mode, filters } = readDescubrirRequest(await searchParams);
  const now = Date.now();
  const today = limaDay(now);
  let since = mode === "nuevo" ? windowStart(today, NEW_WINDOW_DAYS) : null;
  let initial: FeedPage | null = null;
  let result = await getDescubrirPage(filters, since);
  if (!result) warnMissingSupabaseEnv();
  if (result && !result.error && mode === "nuevo" && (result.count ?? 0) < SPARSE_MINIMUM) {
    const wider = windowStart(today, SPARSE_WINDOW_DAYS);
    const second = await getDescubrirPage(filters, wider);
    if (second && !second.error) {
      since = wider;
      result = second;
    }
  }
  if (result && !result.error) initial = { listings: (result.data ?? []) as DescubrirItem[], total: result.count ?? null };

  return (
    <main id="contenido" tabIndex={-1} className="surface-frame h-[100dvh] overflow-hidden bg-frame">
      <DescubrirFeed mode={mode} filters={filters} title={feedTitle(mode, filters)} exit={exitHref(mode, filters)} today={today} now={now} since={since} initial={initial} />
    </main>
  );
}
