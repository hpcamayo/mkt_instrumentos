import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5] as const;

// Five stars filled to an average out of 5, to the tenth the figure next to it shows (4,3 fills four stars and a third).
// For the eye only: the caller always says the figure in words beside it ("4,3 de 5"), so nothing depends on the stars.
// The stars sit edge to edge and the filled row is cut in pixels (a grid or flex parent may stretch the box), so the
// filled share of the stars is the share of the average.
export function StarMeter({ value, size = 20, className }: { value: number; size?: 16 | 20 | 24; className?: string }) {
  const share = Math.min(Math.max(Math.round(value * 10) / 10, 0), 5) / 5;
  const row = (filled: boolean) =>
    STARS.map((star) => (
      <Star key={star} width={size} height={size} strokeWidth={1.75} fill={filled ? "currentColor" : "none"} className="shrink-0" />
    ));
  return (
    <span aria-hidden="true" className={cn("relative inline-flex w-fit shrink-0 align-middle", className)}>
      <span className="flex text-line-strong">{row(false)}</span>
      <span className="absolute inset-y-0 left-0 flex overflow-hidden text-ink" style={{ width: `${share * STARS.length * size}px` }}>
        {row(true)}
      </span>
    </span>
  );
}
