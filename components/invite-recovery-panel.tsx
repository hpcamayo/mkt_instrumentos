import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

type InviteRecoveryPanelProps = {
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function InviteRecoveryPanel({
  title,
  message,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: InviteRecoveryPanelProps) {
  return (
    <div className="rounded-panel bg-warning-tint p-5 t-ui text-ink">
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
  );
}
