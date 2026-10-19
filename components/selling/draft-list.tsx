import Link from "next/link";
import { FileClock } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import type { DraftSummary } from "@/lib/sell-page-data";

// POST 02: drafts saved to the account, to finish on any device. Shown on the publish pages and in Mis publicaciones.
export function DraftList({ drafts, href, title = "Borradores" }: { drafts: DraftSummary[]; href: string; title?: string }) {
  if (!drafts.length) return null;
  return (
    <section className="grid gap-3 rounded-panel border border-subtle bg-white p-5" aria-labelledby="borradores-titulo">
      <h2 id="borradores-titulo" className="t-ui font-semibold text-ink">{title}</h2>
      <ul className="grid gap-2">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex flex-wrap items-center gap-3 rounded-control bg-canvas p-3">
            <FileClock className="h-5 w-5 shrink-0 text-ink-2" aria-hidden />
            <div className="grid min-w-0 flex-1">
              <p className="truncate t-ui font-semibold text-ink"><span className="sr-only">Borrador: </span>{draft.title?.trim() || "Sin título"}</p>
              <p className="t-meta">Borrador · {draft.photoCount} {draft.photoCount === 1 ? "foto" : "fotos"} · {updated(draft.updatedAt)}</p>
            </div>
            <Link href={`${href}?borrador=${draft.id}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>Continuar</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function updated(value: string) {
  return `editado el ${new Date(value).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" })}`;
}
