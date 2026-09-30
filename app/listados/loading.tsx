import { PageContainer } from "@/components/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ListingsLoading() {
  return (
    <section className="bg-canvas/70">
      <PageContainer className="flex flex-col gap-6 py-6 sm:gap-7 sm:py-8">
        <span className="sr-only">Cargando publicaciones</span>

        <div className="rounded-panel border border-subtle bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-4 w-24 rounded-tag" />
              <Skeleton className="h-10 w-80 max-w-full" />
              <Skeleton className="h-4 w-[36rem] max-w-full" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[286px_minmax(0,1fr)] lg:items-start xl:gap-6">
          <div className="grid grid-cols-2 gap-3 lg:hidden">
            <Skeleton className="h-11 bg-white" />
            <Skeleton className="h-11 bg-white" />
          </div>

          <aside className="hidden rounded-panel border border-subtle bg-white p-4 lg:sticky lg:top-5 lg:block">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-3 w-16 rounded-tag" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid gap-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="grid gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-10 bg-canvas" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-5 h-11 bg-action" />
          </aside>

          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-7 w-28 bg-white" />
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
    <article className="overflow-hidden rounded-panel border border-subtle bg-white">
      <Skeleton className="relative aspect-[4/3] rounded-none" />

      <div className="space-y-3 p-3.5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-4 min-w-0 flex-1" />
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
    </article>
  );
}
