import { Check, X } from "lucide-react";
import { CatalogLink } from "@/components/catalog-navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Filter chips. "selected" is an on/off option (blue fill + check); "applied" is an active filter that the
// chip removes when pressed (tint + ×). The accessible name says what pressing does.
function chipClasses(state: "default" | "selected" | "applied", className?: string) {
  return cn(
    "inline-flex h-10 max-w-full shrink-0 items-center gap-1.5 rounded-control px-3 text-[14px] font-semibold leading-5 text-ink transition-colors duration-120 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
    state === "default" && "border border-line-strong bg-surface hover:bg-canvas",
    state === "selected" && "bg-accent hover:bg-accent/85",
    state === "applied" && "bg-accent-tint hover:bg-accent/30",
    className,
  );
}

export function Chip({
  selected = false,
  className,
  children,
  type,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { selected?: boolean; children: ReactNode }) {
  return (
    <button type={type ?? "button"} aria-pressed={selected} className={chipClasses(selected ? "selected" : "default", className)} {...rest}>
      {selected ? <Check aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

// A chip that navigates (a period, a type, a short filter value). Inside the catalog it reports to the page's pending
// state (CatalogLink); elsewhere it is a plain client link.
export function ChipLink({
  href,
  selected = false,
  current = "true",
  id,
  className,
  children,
}: {
  href: string;
  selected?: boolean;
  current?: "page" | "true";
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <CatalogLink id={id} href={href} aria-current={selected ? current : undefined} className={chipClasses(selected ? "selected" : "default", className)}>
      {selected ? <Check aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </CatalogLink>
  );
}

// An applied filter: pressing it removes the filter. It shows the value ("Lima"); its name says what pressing does
// ("Quitar filtro: Ubicación: Lima"). A client link that reports to the catalog's pending state.
export function AppliedChip({ href, text, label, className }: { href: string; text: string; label: string; className?: string }) {
  return (
    <CatalogLink href={href} aria-label={`Quitar filtro: ${label}`} className={chipClasses("applied", className)}>
      <span className="truncate">{text}</span>
      <X aria-hidden />
    </CatalogLink>
  );
}
