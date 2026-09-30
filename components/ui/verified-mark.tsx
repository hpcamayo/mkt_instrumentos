import { cn } from "@/lib/utils";

// Blue disc with an ink check (7.6:1) and the words, so the mark never depends on color alone.
export function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("h-4 w-4 shrink-0", className)} aria-hidden focusable="false">
      <circle cx="10" cy="10" r="10" className="fill-accent" />
      <path d="M5.8 10.3l2.7 2.7 5.7-6" fill="none" className="stroke-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VerifiedMark({ label = "Tienda verificada", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 t-ui font-semibold", className)}>
      <VerifiedIcon />
      {label}
    </span>
  );
}
