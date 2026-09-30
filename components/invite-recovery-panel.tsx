import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { NoticeIcon, noticeClassName } from "@/components/ui/notice";

type InviteRecoveryPanelProps = {
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

// A warning notice with its own buttons (Notice's body styles plain links, so the parts are used directly).
export function InviteRecoveryPanel({
  title,
  message,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: InviteRecoveryPanelProps) {
  return (
    <div className={noticeClassName("warning", "p-5")}>
      <NoticeIcon tone="warning" />
      <div className="min-w-0 flex-1">
        <h2 className="t-section text-ink">{title}</h2>
        <p className="mt-2">{message}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className={buttonClasses()}
            href={primaryHref}
          >
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link
              className={buttonClasses({ variant: "secondary" })}
              href={secondaryHref}
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
