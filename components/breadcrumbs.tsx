import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { Crumb } from "@/lib/shell";
import { cn } from "@/lib/utils";

// Breadcrumbs (docs/ux-redesign/ux-2-shell.md): the full trail from 768 px, 13 px, links in ink-2 with a
// decorative underline and the current page in ink (not a link). On phones only the listing page shows a back link
// to the parent (`phoneBackLink`); the browse pages show nothing there, since the category strip leads back (N11).
export function Breadcrumbs({ items, phoneBackLink = false, className }: { items: Crumb[]; phoneBackLink?: boolean; className?: string }) {
  const parent = phoneBackLink ? items.slice(0, -1).findLast((item) => item.href) : undefined;
  return (
    <nav aria-label="Ruta de navegación" className={cn("t-meta", !parent?.href && "hidden md:block", className)}>
      <ol className="hidden flex-wrap items-center gap-x-1.5 gap-y-1 md:flex">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true" className="text-ink-3">/</span> : null}
              {current || !item.href ? (
                <span aria-current={current ? "page" : undefined} className="min-w-0 break-words text-ink">{item.label}</span>
              ) : (
                <Link href={item.href} className="text-ink-2 underline decoration-line-deco underline-offset-[3px] transition-colors duration-120 hover:text-ink hover:decoration-ink">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {parent?.href ? (
        <Link href={parent.href} className="-ml-1 inline-flex min-h-11 items-center gap-1 pr-2 t-ui text-ink-2 hover:text-ink md:hidden">
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          <span><span className="sr-only">Volver a </span>{parent.label}</span>
        </Link>
      ) : null}
    </nav>
  );
}
