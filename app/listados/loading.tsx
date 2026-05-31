import { PageContainer } from "@/components/page-container";

export default function ListingsLoading() {
  return (
    <section className="bg-laria-cloud/70">
      <PageContainer className="flex flex-col gap-6 py-6 sm:gap-7 sm:py-8">
        <span className="sr-only">Cargando listados</span>

        <div className="rounded-lg border border-laria-fog bg-white p-4 shadow-[0_18px_48px_rgb(16_18_23/0.06)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-blue-100" />
              <div className="h-10 w-80 max-w-full animate-pulse rounded bg-laria-fog" />
              <div className="h-4 w-[36rem] max-w-full animate-pulse rounded bg-laria-fog" />
            </div>
            <div className="h-9 w-32 animate-pulse rounded-full bg-laria-fog" />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[286px_minmax(0,1fr)] lg:items-start xl:gap-6">
          <div className="grid grid-cols-2 gap-3 lg:hidden">
            <div className="h-11 animate-pulse rounded-md bg-white shadow-sm" />
            <div className="h-11 animate-pulse rounded-md bg-white shadow-sm" />
          </div>

          <aside className="hidden rounded-lg border border-laria-fog bg-white p-4 shadow-[0_16px_36px_rgb(16_18_23/0.06)] lg:sticky lg:top-5 lg:block">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-blue-100" />
                <div className="h-5 w-20 animate-pulse rounded bg-laria-fog" />
              </div>
              <div className="h-4 w-24 animate-pulse rounded bg-laria-fog" />
            </div>
            <div className="grid gap-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="grid gap-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-laria-fog" />
                  <div className="h-10 animate-pulse rounded-md bg-laria-cloud" />
                </div>
              ))}
            </div>
            <div className="mt-5 h-11 animate-pulse rounded-md bg-laria-yellow" />
          </aside>

          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-7 w-28 animate-pulse rounded-full bg-white shadow-sm"
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
    </section>
  );
}

function ListingCardSkeleton() {
  return (
    <article className="overflow-hidden rounded-lg border border-laria-fog bg-white shadow-[0_14px_34px_rgb(16_18_23/0.06)]">
      <div className="relative aspect-[4/3] animate-pulse bg-laria-fog">
        <div className="absolute left-2 top-2 h-6 w-28 rounded bg-white/80" />
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
          <div className="h-7 w-7 rounded-full bg-laria-steel/80" />
          <div className="h-4 w-16 rounded-full bg-laria-steel/80" />
          <div className="h-7 w-7 rounded-full bg-laria-steel/80" />
        </div>
      </div>

      <div className="space-y-3 p-3.5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="h-4 min-w-0 flex-1 animate-pulse rounded bg-laria-fog" />
            <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-laria-fog" />
          </div>
          <div className="h-3 w-32 animate-pulse rounded bg-laria-fog" />
        </div>

        <div className="space-y-2">
          <div className="h-5 w-24 animate-pulse rounded bg-laria-fog" />
          <div className="h-3 w-36 animate-pulse rounded bg-laria-fog" />
        </div>
      </div>
    </article>
  );
}
