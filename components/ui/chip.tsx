import Link from "next/link";
import { Check, X } from "lucide-react";
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

export function ChipLink({
  href,
  selected = false,
  current = "true",
  className,
  children,
}: {
  href: string;
  selected?: boolean;
  current?: "page" | "true";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} aria-current={selected ? current : undefined} className={chipClasses(selected ? "selected" : "default", className)}>
      {selected ? <Check aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </Link>
  );
}

// An applied filter: pressing it removes the filter. A plain link on purpose: the full page load also resets
// the filter form, whose fields are uncontrolled (components/listing-filters.tsx).
export function AppliedChip({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <a href={href} aria-label={`Quitar filtro: ${label}`} className={chipClasses("applied", className)}>
      <span className="truncate">{label}</span>
      <X aria-hidden />
    </a>
  );
}
