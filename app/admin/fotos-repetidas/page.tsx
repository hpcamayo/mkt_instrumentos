import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminPhoto } from "@/components/admin-feature/admin-photo";
import { AdminReviewActions } from "@/components/admin-feature/admin-review-actions";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin-server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { statusLabel } from "@/lib/ui/status";

export const metadata = { title: "Fotos repetidas" };

const FILTERS = [
  { value: "open", label: "Por revisar" },
  { value: "confirmed", label: "Copias" },
  { value: "dismissed", label: "No eran copias" },
] as const;

type Side = { id: string; title: string; slug: string; status: string; seller: string | null };
type Flag = { id: string; status: string; detail: { photo?: number; matched_photo?: number; distance?: number }; review_note: string | null; listing: Side; matched: Side };

// safe-05 (feature ideas, accounts batch): listings whose photos look like another seller's. The newer listing carries
// the flag; nothing was rejected or hidden. Admin compares and decides with the usual moderation tools.
export default async function AdminPhotoCopiesPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const [{ supabase }, query] = await Promise.all([requireAdmin("/admin/fotos-repetidas"), searchParams]);
  const status = FILTERS.find((filter) => filter.value === query.estado)?.value ?? "open";
  const { data, error } = await supabase.rpc("admin_red_flags", { p_status: status, p_limit: 50 });
  const payload = data && typeof data === "object" && !Array.isArray(data) ? (data as { counts?: Record<string, number>; items?: Flag[] }) : null;
  const flags = payload?.items ?? [];
  const photos = await photoUrls(flags);

  return (
    <div className="space-y-5">
      <PageHeader title="Fotos repetidas" meta={<p className="max-w-[68ch]">Publicaciones con una foto casi igual a la de otro vendedor. Puede ser una foto robada de otra publicación o una foto de catálogo: compáralas y decide con las herramientas de moderación.</p>} />
      <nav aria-label="Estado de la alerta" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <ChipLink key={filter.value} href={`/admin/fotos-repetidas?estado=${filter.value}`} selected={filter.value === status} current="page">
            {filter.label}{payload?.counts?.[filter.value] ? ` (${payload.counts[filter.value]})` : ""}
          </ChipLink>
        ))}
      </nav>
      {error || !payload ? (
        <Notice tone="danger">No pudimos cargar las alertas. No asumiremos que no hay pendientes.</Notice>
      ) : flags.length ? (
        <ul className="grid gap-4">
          {flags.map((flag) => (
            <li key={flag.id} className="grid gap-4 rounded-panel border border-subtle bg-white p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {[{ side: flag.listing, photo: flag.detail.photo, label: "Más nueva" }, { side: flag.matched, photo: flag.detail.matched_photo, label: "Anterior" }].map(({ side, photo, label }) => (
                  <div key={side.id} className="grid content-start gap-2">
                    <p className="t-micro text-ink-2">{label}</p>
                    <AdminPhoto src={photos.get(`${side.id}:${(photo ?? 1) - 1}`) ?? null} label={`Foto ${photo ?? "?"}`} />
                    <p className="t-ui font-semibold text-ink">{side.title}</p>
                    <p className="t-meta">{side.seller ?? "Sin nombre"} · {statusLabel("listing", side.status)}</p>
                    <Link href={`/admin/publicaciones?buscar=${encodeURIComponent(side.id)}`} className="link w-fit t-meta font-semibold">Abrir en gestión</Link>
                  </div>
                ))}
              </div>
              <p className="t-meta">Diferencia: {flag.detail.distance ?? "?"} de 64 (0 es idéntica).</p>
              {flag.status === "open" ? (
                <AdminReviewActions
                  endpoint="/api/admin/red-flags"
                  body={{ id: flag.id }}
                  options={[{ status: "confirmed", label: "Es una copia", variant: "danger" }, { status: "dismissed", label: "No es copia" }]}
                  done="Guardado. Si es una copia, rechaza u oculta la publicación desde gestión."
                />
              ) : flag.review_note ? <p className="t-meta">Nota: {flag.review_note}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No hay alertas en este estado" description="Las fotos se comparan al abrir una publicación en Moderación y una vez al día." />
      )}
    </div>
  );
}

// The compared photos' URLs, read with the service role (private listings included).
async function photoUrls(flags: Flag[]) {
  const urls = new Map<string, string>();
  const admin = getSupabaseAdminClient();
  const ids = [...new Set(flags.flatMap((flag) => [flag.listing.id, flag.matched.id]))];
  if (!admin || !ids.length) return urls;
  const { data } = await (admin as unknown as SupabaseClient).from("listing_photos").select("listing_id,image_url,sort_order").in("listing_id", ids);
  for (const row of (data ?? []) as { listing_id: string; image_url: string; sort_order: number }[]) urls.set(`${row.listing_id}:${row.sort_order}`, row.image_url);
  return urls;
}
