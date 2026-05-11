import { PageContainer } from "@/components/page-container";

export default function ListingsLoading() {
  return (
    <PageContainer as="section" className="flex flex-col gap-5 py-5 sm:gap-6 sm:py-6">
      <span className="sr-only">Cargando listados</span>

      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded bg-amber-200" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="h-8 w-72 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-[36rem] max-w-full animate-pulse rounded bg-slate-200" />
          </div>
          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start xl:gap-6">
        <div className="grid grid-cols-2 gap-3 lg:hidden">
          <div className="h-11 animate-pulse rounded-md bg-slate-200" />
          <div className="h-11 animate-pulse rounded-md bg-slate-200" />
        </div>

        <aside className="hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-5 lg:block">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="h-5 w-16 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="grid gap-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="grid gap-2">
                <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                <div className="h-10 animate-pulse rounded-md bg-slate-100" />
              </div>
            ))}
          </div>
          <div className="mt-5 h-11 animate-pulse rounded-md bg-slate-300" />
        </aside>

        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-7 w-28 animate-pulse rounded-full bg-slate-200"
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-[18px] min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 2xl:gap-6">
            {Array.from({ length: 10 }).map((_, index) => (
              <ListingCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function ListingCardSkeleton() {
  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] animate-pulse bg-slate-200">
        <div className="absolute left-2 top-2 h-6 w-28 rounded bg-white/80" />
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
          <div className="h-7 w-7 rounded-full bg-slate-300/80" />
          <div className="h-4 w-16 rounded-full bg-slate-300/80" />
          <div className="h-7 w-7 rounded-full bg-slate-300/80" />
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="h-4 min-w-0 flex-1 animate-pulse rounded bg-slate-200" />
            <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-slate-200" />
          </div>
          <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
        </div>

        <div className="space-y-2">
          <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
    </article>
  );
}
