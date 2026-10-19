import { PageContainer } from "@/components/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import type { SkeletonKind } from "@/lib/navigation-feedback";

// fast-01: the outline of the page on its way, shown only when a page change takes more than a second
// (components/navigation-feedback.tsx). Each follows its page's frame: the listing's gallery and decision column
// (docs/design-system.md § Listing page), the store's header and grid, the account's switcher row and rail.
export function NavigationSkeleton({ kind }: { kind: SkeletonKind }) {
  if (kind === "listing") return <ListingSkeleton />;
  if (kind === "store") return <StoreSkeleton />;
  return <AccountSkeleton />;
}

function ListingSkeleton() {
  return (
    <PageContainer className="pb-10 pt-3 md:pt-5">
      <Skeleton className="h-5 w-56 max-w-full" />
      <div className="mt-2 flex flex-col gap-6 md:mt-4 lg:grid lg:grid-cols-12 lg:gap-x-8">
        <Skeleton className="aspect-[4/3] w-full rounded-panel lg:col-span-7" />
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-[52px] w-full" />
          <Skeleton className="h-28 w-full rounded-panel" />
        </div>
      </div>
    </PageContainer>
  );
}

function StoreSkeleton() {
  return (
    <>
      <div className="border-b border-subtle">
        <PageContainer className="flex items-center gap-4 py-6 lg:py-8">
          <Skeleton className="h-16 w-16 shrink-0 rounded-panel lg:h-20 lg:w-20" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
        </PageContainer>
      </div>
      <PageContainer className="pb-12 pt-6 lg:pt-8">
        <Skeleton className="h-6 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className={index >= 4 ? "hidden md:flex md:flex-col md:gap-2" : "flex flex-col gap-2"}>
              <Skeleton className="aspect-[4/3] w-full rounded-panel" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ))}
        </div>
      </PageContainer>
    </>
  );
}

function AccountSkeleton() {
  return (
    <>
      <div className="border-b border-line-deco lg:hidden">
        <PageContainer className="flex min-h-12 items-center">
          <Skeleton className="h-5 w-48" />
        </PageContainer>
      </div>
      <PageContainer className="py-6 lg:py-8">
        <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
          <div className="hidden lg:flex lg:flex-col lg:gap-2 lg:px-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mb-3 h-4 w-28" />
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full rounded-panel" />)}
          </div>
        </div>
      </PageContainer>
    </>
  );
}
