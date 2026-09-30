import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

// Prices in soles, semi-condensed with tabular figures. A previous price (price drop) is shown struck through.
export function Price({
  value,
  previous,
  size = "card",
  className,
}: {
  value: number | null;
  previous?: number | null;
  size?: "card" | "detail" | "inline";
  className?: string;
}) {
  if (value === null) {
    return <span className={cn("t-ui font-semibold text-ink-2", className)}>{formatPrice(null)}</span>;
  }
  const sizeClass = size === "detail" ? "t-price-detail" : size === "card" ? "t-card-price" : "font-semibold tabular-nums";
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 text-ink", className)}>
      <span className={sizeClass}>{formatPrice(value)}</span>
      {previous && previous > value ? (
        <span className="t-meta line-through">
          <span className="sr-only">Antes </span>
          {formatPrice(previous)}
        </span>
      ) : null}
    </span>
  );
}
