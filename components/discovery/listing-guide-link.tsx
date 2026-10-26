import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { guidePath, guidesForListing } from "@/lib/discovery/buying-guides";
import { cn } from "@/lib/utils";

// disc-02 on the listing page: the try-out checklist (and the "cómo elegir" guide) for this kind of instrument, to
// open before the meetup. Nothing when no guide covers the category.
export function ListingGuideLink({ category, instrumentType, className }: { category: string | null; instrumentType: string | null; className?: string }) {
  const guides = guidesForListing(category, instrumentType);
  if (guides.length === 0) return null;
  return (
    <section aria-labelledby="guias-de-compra" className={cn("rounded-panel border border-subtle p-4", className)}>
      <h2 id="guias-de-compra" className="flex items-center gap-2 t-ui font-semibold text-ink">
        <ClipboardCheck aria-hidden className="h-5 w-5" />
        Antes de ir a verlo
      </h2>
      <ul className="mt-2 grid gap-1">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link href={guidePath(guide.slug)} className="link inline-flex min-h-6 items-center t-ui">{guide.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
