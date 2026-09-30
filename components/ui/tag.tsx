import { Archive, Check, Clock, EyeOff, Pause, Pencil, Tag as TagIcon, X } from "lucide-react";
import type { ReactNode } from "react";
import { statusEntry, type StatusDomain, type StatusEntry, type StatusIcon, type StatusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

// Rectangular tags with always-readable text; state is never told by color alone (icon + word).
const TONES: Record<StatusTone, string> = {
  neutral: "bg-subtle text-ink",
  accent: "bg-accent-tint text-ink",
  warning: "bg-warning-tint text-ink",
  danger: "bg-danger-tint text-danger",
  solid: "bg-ink text-surface",
  line: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]",
};

const ICONS: Record<StatusIcon, ReactNode> = {
  draft: <Pencil aria-hidden />,
  review: <Clock aria-hidden />,
  check: <Check aria-hidden />,
  reject: <X aria-hidden />,
  hidden: <EyeOff aria-hidden />,
  sold: <TagIcon aria-hidden />,
  archive: <Archive aria-hidden />,
  pause: <Pause aria-hidden />,
};

export function Tag({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1 rounded-tag px-2 py-0.5 text-[13px] font-semibold leading-[18px] [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
        TONES[tone],
        className,
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function StatusTag({ domain, status, className }: { domain: StatusDomain; status: string | null | undefined; className?: string }) {
  return <StatusEntryTag entry={statusEntry(domain, status)} className={className} />;
}

// For a status already resolved to a dictionary entry (or a derived one such as "Tienda verificada").
export function StatusEntryTag({ entry, className }: { entry: StatusEntry; className?: string }) {
  return (
    <Tag tone={entry.tone} icon={entry.icon ? ICONS[entry.icon] : undefined} className={className}>
      {entry.label}
    </Tag>
  );
}

// Small count on a navigation item (e.g. unread notifications). The number is also in the accessible name.
export function CountBadge({ count, label, className }: { count: number; label?: string; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-action px-1.5 text-[12px] font-bold leading-none text-action-ink tabular-nums",
        className,
      )}
      aria-label={label ?? String(count)}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
