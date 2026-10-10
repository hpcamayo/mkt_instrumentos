import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Every limitation text of the listing and store pages, in one place (UX-4 L5 A: the full limitation, worded per
// surface; LEGAL-005/006, REVW-020, SCOPE-001–006). Each page shows one trust statement next to its contact button;
// the other lines below belong to their own sections (the reviews, a sold listing, the store's verification).
export const TRUST_COPY = {
  listing:
    "Coordinas el pago y la entrega directamente con quien vende. Laria no procesa pagos, no retiene dinero, no gestiona envíos ni garantiza el equipo o la transacción.",
  store: "Coordinas el pago y la entrega directamente con la tienda. Laria no procesa pagos ni envíos.",
  bar: "Laria no procesa pagos ni envíos",
  reviews:
    "Solo se reseña después de una compra que comprador y vendedor confirmaron en Laria. Laria no procesó el pago ni la entrega.",
  sold: "Este registro se conserva como historial. Laria no procesó ni garantizó la transacción.",
  verifiedStore: "Laria revisó a mano su RUC, razón social y contacto. No es una garantía sobre su equipo ni sus ventas.",
  approvedStore: "Laria aprobó esta tienda. Cada publicación suya se revisa antes de mostrarse.",
} as const;

export function SafetyLink({ className }: { className?: string }) {
  return (
    <Link href="/consejos-de-seguridad" className={cn("link font-semibold", className)}>
      Consejos de seguridad
    </Link>
  );
}

// The trust statement beside a contact button: a 16 px shield, the text in t-meta and "Consejos de seguridad".
export function TrustNote({ surface, className }: { surface: "listing" | "store"; className?: string }) {
  return (
    <p className={cn("flex gap-2 t-meta", className)}>
      <ShieldCheck aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-ink" />
      <span>
        {TRUST_COPY[surface]} <SafetyLink />
      </span>
    </p>
  );
}
