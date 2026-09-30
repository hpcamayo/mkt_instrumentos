import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NoticeTone = "info" | "success" | "warning" | "danger";

const TONES: Record<NoticeTone, { className: string; icon: ReactNode }> = {
  info: { className: "bg-accent-tint", icon: <Info aria-hidden /> },
  success: { className: "bg-accent-tint", icon: <CheckCircle2 aria-hidden /> },
  warning: { className: "bg-warning-tint", icon: <AlertTriangle aria-hidden /> },
  danger: { className: "bg-danger-tint", icon: <XCircle aria-hidden /> },
};

export function noticeClassName(tone: NoticeTone, className?: string) {
  return cn(
    "flex gap-3 rounded-panel px-4 py-3 t-ui text-ink [&>svg]:mt-0.5 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0",
    TONES[tone].className,
    className,
  );
}

export function NoticeIcon({ tone }: { tone: NoticeTone }) {
  return <>{TONES[tone].icon}</>;
}

export const noticeBodyClassName =
  "min-w-0 flex-1 [&_a]:font-semibold [&_a]:underline [&_a]:decoration-accent [&_a]:decoration-2 [&_a]:underline-offset-[3px]";

// Icon + text, never color alone. Danger notices are announced as alerts, the rest as status.
export function Notice({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status" | "note";
}) {
  return (
    <div role={role ?? (tone === "danger" ? "alert" : "status")} className={noticeClassName(tone, className)}>
      {TONES[tone].icon}
      <div className={noticeBodyClassName}>
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
