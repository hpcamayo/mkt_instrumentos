import { ChevronDown } from "lucide-react";
import { TRUST_COPY } from "@/components/listing/trust-note";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { formatMonthYear, type StoreChecks } from "@/lib/listing-page";
import { cn } from "@/lib/utils";

// "Tienda verificada" that explains itself (trust-03): pressing the badge shows what Laria checked by hand (RUC, razón
// social, address, a contact phone) and since when, and what verification does not mean. A native <details>, so it
// works before the page's scripts load and needs no state. Without the checks (the call failed) it stays the label.
// The street appears only when the store shows it on its page (list-12); otherwise only its district and city
// (UXD-integration-11), as the phone is only said to be on file.
export function VerifiedExplainer({ checks, className }: { checks: StoreChecks | null; className?: string }) {
  if (!checks) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 t-ui font-semibold", className)}>
        <VerifiedIcon />
        Tienda verificada
      </span>
    );
  }
  const since = formatMonthYear(checks.verifiedSince);
  const area = [checks.district, checks.city].filter(Boolean).join(", ");
  const place = checks.address ? [checks.address, area].filter(Boolean).join(", ") : null;
  return (
    <details className={cn("group w-full", className)}>
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded-control t-ui font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <VerifiedIcon />
        Tienda verificada
        <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
        <span className="sr-only">: ver qué revisó Laria</span>
      </summary>
      <div className="mt-2 rounded-control bg-canvas p-3 t-meta text-ink">
        <p className="font-semibold">Laria revisó a mano{since ? ` (verificada desde ${since})` : ""}:</p>
        <ul className="mt-1 grid gap-1">
          {checks.ruc ? <li>RUC {checks.ruc}</li> : null}
          {checks.razonSocial ? <li>Razón social: {checks.razonSocial}</li> : null}
          {place ? <li>Dirección: {place}</li> : checks.addressChecked ? <li>{area ? `Una dirección en ${area}` : "Una dirección física"}</li> : null}
          {checks.phoneOnFile ? <li>Un teléfono de contacto</li> : null}
        </ul>
        <p className="mt-2 text-ink-2">{TRUST_COPY.verifiedStore}</p>
      </div>
    </details>
  );
}
