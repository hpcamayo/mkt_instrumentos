"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Flag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";

export type ReportTarget = "listing" | "store" | "review";

// The form and its Supabase client load on the first press (UX-4 L15), never with the page.
const ContentReportForm = dynamic(() => import("@/components/content-report-form"), {
  ssr: false,
  loading: () => <p role="status" className="t-meta">Cargando…</p>,
});

// "Reportar publicación / tienda / reseña" (REP-001–005, REVW-015). Signed out it is a sign-in link that comes back
// here; signed in, a quiet link that opens the report form in place.
export function ContentReport({
  targetType,
  targetId,
  label,
  icon = false,
}: {
  targetType: ReportTarget;
  targetId: string;
  label: string;
  // An 18 px flag before the label (the listing page's "Reportar publicación").
  icon?: boolean;
}) {
  const pathname = usePathname();
  const account = useMarketplaceAccount();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const restoreFocusRef = useRef(false);
  const flag = icon ? <Flag aria-hidden="true" className="h-[18px] w-[18px] shrink-0" /> : null;

  useEffect(() => {
    if (message) {
      feedbackRef.current?.focus();
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [message]);

  useEffect(() => {
    if (!open && restoreFocusRef.current && !message) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [message, open]);

  if (!account.ready) {
    return <span className="t-meta">Comprobando acceso…</span>;
  }

  if (!account.authenticated) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="link inline-flex items-center gap-1.5 t-meta font-semibold"
      >
        {flag}
        Ingresa para {label.toLowerCase()}
      </Link>
    );
  }

  return (
    <div className="grid gap-2">
      {message ? (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role={failed ? "alert" : "status"}
          className={failed ? "t-meta font-semibold text-danger" : "t-meta font-semibold"}
        >
          {message}
        </p>
      ) : null}
      {!open ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setMessage("");
            setFailed(false);
            setOpen(true);
          }}
          className="link inline-flex w-fit items-center gap-1.5 t-meta font-semibold"
        >
          {flag}
          {label}
        </button>
      ) : (
        <ContentReportForm
          targetType={targetType}
          targetId={targetId}
          onDone={(result) => {
            setFailed(result.failed);
            if (!result.failed) setOpen(false);
            setMessage(result.message);
          }}
          onCancel={() => {
            restoreFocusRef.current = true;
            setMessage("");
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
