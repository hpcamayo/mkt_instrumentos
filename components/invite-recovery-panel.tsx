import Link from "next/link";

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
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-2">{message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          href={primaryHref}
        >
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link
            className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-brass hover:text-brass"
            href={secondaryHref}
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
