import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { ReviewPhotoModeration, SafeSpotAdmin } from "@/components/trust/admin-trust-actions";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { positivePage } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-server";

export const metadata = { title: "Confianza" };

const VIEWS = [
  { value: "fotos", label: "Fotos de reseñas" },
  { value: "puntos", label: "Puntos seguros" },
  { value: "tienda", label: "Compras en tienda" },
] as const;
const PHOTO_STATES = [
  { value: "pending", label: "Por revisar" },
  { value: "approved", label: "Aprobadas" },
  { value: "hidden", label: "Ocultas" },
] as const;
const PAGE_SIZE = 24;

type Row = Record<string, unknown>;

// Admin > Confianza (deal-trust batch, docs/feature-ideas/deal-trust.md): review photos before anyone sees them
// (safe-06), the stores offering themselves as «Punto seguro Laria» (safe-03), and purchases confirmed with a store's
// counter code (reach-11), with how often the same buyer confirmed at the same store, to spot inflated reviews.
export default async function AdminTrustPage({ searchParams }: { searchParams: Promise<{ vista?: string; estado?: string; pagina?: string }> }) {
  const [{ supabase }, query] = await Promise.all([requireAdmin("/admin/confianza"), searchParams]);
  const db = supabase as unknown as SupabaseClient;
  const view = VIEWS.find((item) => item.value === query.vista)?.value ?? "fotos";
  const page = positivePage(query.pagina);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Confianza"
        meta={<p className="max-w-[68ch]">Fotos de reseñas por revisar, Puntos seguros y compras confirmadas en tienda. Cada cambio queda en Auditoría.</p>}
      />
      <nav aria-label="Sección" className="flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <ChipLink key={item.value} href={`/admin/confianza?vista=${item.value}`} selected={item.value === view} current="page">{item.label}</ChipLink>
        ))}
      </nav>
      {view === "fotos" ? <PhotoQueue db={db} status={PHOTO_STATES.find((item) => item.value === query.estado)?.value ?? "pending"} page={page} /> : null}
      {view === "puntos" ? <SafeSpots db={db} /> : null}
      {view === "tienda" ? <CounterPurchases db={db} page={page} /> : null}
    </div>
  );
}

async function PhotoQueue({ db, status, page }: { db: SupabaseClient; status: "pending" | "approved" | "hidden"; page: number }) {
  const { data, error } = await db.rpc("get_admin_review_photo_queue", { p_status: status, p_page: page, p_page_size: PAGE_SIZE });
  const rows = itemsOf(data);
  return (
    <section aria-label="Fotos de reseñas" className="grid gap-4">
      <nav aria-label="Estado de la foto" className="flex flex-wrap gap-2">
        {PHOTO_STATES.map((item) => (
          <ChipLink key={item.value} href={`/admin/confianza?vista=fotos&estado=${item.value}`} selected={item.value === status} current="page">{item.label}</ChipLink>
        ))}
      </nav>
      {error || !rows ? (
        <Notice tone="danger">No pudimos cargar las fotos. No asumiremos que no hay pendientes.</Notice>
      ) : rows.length === 0 ? (
        <EmptyState headingLevel={2} title="No hay fotos en este estado" description="Las fotos nuevas de reseñas aparecen aquí antes de mostrarse." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const photoId = String(row.id);
            return (
              <li key={photoId} className="grid content-start gap-3 rounded-panel border border-subtle bg-white p-4">
                <a href={`/api/review-photos/${photoId}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-control border border-subtle">
                  <img src={`/api/review-photos/${photoId}`} alt="Foto de la reseña" width={320} height={240} loading="lazy" className="h-60 w-full bg-canvas object-contain" />
                </a>
                <div className="t-ui text-ink">
                  <p><span className="font-semibold">{text(row.reviewer_name) ?? "Comprador"}</span> reseñó a {text(row.subject_name) ?? "un vendedor"} · {String(row.rating)} de 5</p>
                  {text(row.comment) ? <p className="mt-1 whitespace-pre-line text-ink-2">{text(row.comment)}</p> : null}
                  {row.review_hidden === true ? <p className="mt-1 t-meta font-semibold">La reseña está oculta.</p> : null}
                  {text(row.moderation_reason) ? <p className="mt-1 t-meta">Motivo: {text(row.moderation_reason)}</p> : null}
                </div>
                <ReviewPhotoModeration photoId={photoId} status={status} />
              </li>
            );
          })}
        </ul>
      )}
      <Pager view="fotos" extra={`&estado=${status}`} page={page} total={totalOf(data)} />
    </section>
  );
}

async function SafeSpots({ db }: { db: SupabaseClient }) {
  const { data, error } = await db.rpc("get_admin_safe_spots");
  const rows = Array.isArray(data) ? (data as Row[]) : null;
  return (
    <section aria-label="Puntos seguros" className="grid gap-4">
      {error || !rows ? (
        <Notice tone="danger">No pudimos cargar los Puntos seguros.</Notice>
      ) : rows.length === 0 ? (
        <EmptyState headingLevel={2} title="Ninguna tienda es Punto seguro todavía" description="Las tiendas verificadas que muestran su dirección pueden ofrecerlo desde Mi tienda." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => {
            const disabled = Boolean(row.admin_disabled_at);
            return (
              <li key={String(row.store_id)} className="grid gap-3 rounded-panel border border-subtle bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
                <div className="t-ui text-ink">
                  <p className="font-semibold"><Link href={`/tiendas/${String(row.store_slug)}`} className="link">{String(row.store_name)}</Link></p>
                  <p className="t-meta">{[text(row.address), text(row.district), text(row.city)].filter(Boolean).join(", ")}</p>
                  <p className="mt-1">{disabled ? `Quitado por Laria: ${text(row.admin_disabled_reason) ?? "sin motivo"}` : row.enabled === true ? "Activo" : "Apagado por la tienda"}</p>
                  {text(row.note) ? <p className="mt-1 t-meta">Nota: {text(row.note)}</p> : null}
                  {Array.isArray(row.missing) && row.missing.length ? <p className="mt-1 t-meta font-semibold">No se muestra: le falta {row.missing.join(", ")}.</p> : null}
                </div>
                <SafeSpotAdmin storeId={String(row.store_id)} disabled={disabled} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

async function CounterPurchases({ db, page }: { db: SupabaseClient; page: number }) {
  const { data, error } = await db.rpc("get_admin_counter_purchases", { p_page: page, p_page_size: PAGE_SIZE });
  const rows = itemsOf(data);
  return (
    <section aria-label="Compras en tienda" className="grid gap-4">
      {error || !rows ? (
        <Notice tone="danger">No pudimos cargar las compras en tienda.</Notice>
      ) : rows.length === 0 ? (
        <EmptyState headingLevel={2} title="Aún no hay compras en tienda confirmadas" description="Aparecen cuando un cliente confirma con el código del Mostrador." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => {
            const repeated = Number(row.buyer_counter_purchases_30d);
            return (
              <li key={String(row.transaction_id)} className="rounded-panel border border-subtle bg-white p-4 t-ui text-ink">
                <p className="font-semibold">{String(row.title)}</p>
                <p className="mt-1">
                  <Link href={`/tiendas/${String(row.store_slug)}`} className="link">{String(row.store_name)}</Link> · {text(row.buyer_name) ?? "Comprador"} · {formatDate(row.verified_at)}
                </p>
                <p className="mt-1 t-meta">
                  {repeated > 1 ? <span className="font-semibold">{repeated} confirmaciones de este comprador en esta tienda en 30 días · </span> : null}
                  {Number(row.review_count) === 1 ? "1 reseña" : `${Number(row.review_count)} reseñas`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <Pager view="tienda" page={page} total={totalOf(data)} />
    </section>
  );
}

function Pager({ view, extra = "", page, total }: { view: string; extra?: string; page: number; total: number | null }) {
  if (total === null || total <= PAGE_SIZE) return null;
  const last = Math.ceil(total / PAGE_SIZE);
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center gap-3 t-ui">
      {page > 1 ? <Link href={`/admin/confianza?vista=${view}${extra}&pagina=${page - 1}`} className="link font-semibold">Anterior</Link> : null}
      <span>Página {page} de {last}</span>
      {page < last ? <Link href={`/admin/confianza?vista=${view}${extra}&pagina=${page + 1}`} className="link font-semibold">Siguiente</Link> : null}
    </nav>
  );
}

function itemsOf(data: unknown): Row[] | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const items = (data as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter((item): item is Row => Boolean(item) && typeof item === "object") : null;
}

function totalOf(data: unknown) {
  const total = data && typeof data === "object" ? (data as { total?: unknown }).total : null;
  return typeof total === "number" ? total : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatDate(value: unknown) {
  return typeof value === "string" ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(value)) : "";
}
