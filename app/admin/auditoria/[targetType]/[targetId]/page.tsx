import Link from "next/link";
import { notFound } from "next/navigation";
import { adminValueLabel } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-server";
import type { Json } from "@/lib/supabase/database.types";

const AUDIT_DATE_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const TARGET_TYPES = [
  "listing",
  "listing_revision",
  "store",
  "report",
  "review",
  "legacy_link",
] as const;

type AuditTargetType = (typeof TARGET_TYPES)[number];
type AuditEntry = {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  admin_name: string | null;
  admin_user_id: string;
  created_at: string;
  detail: Record<string, Json | undefined>;
};

function isTargetType(value: string): value is AuditTargetType {
  return TARGET_TYPES.includes(value as AuditTargetType);
}

function parseHistory(value: Json | null): AuditEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    if (typeof entry.id !== "string" || typeof entry.action !== "string" || typeof entry.created_at !== "string") return [];
    const detail = entry.detail && typeof entry.detail === "object" && !Array.isArray(entry.detail)
      ? entry.detail as Record<string, Json | undefined>
      : {};
    return [{
      id: entry.id,
      action: entry.action,
      target_type: typeof entry.target_type === "string" ? entry.target_type : "",
      target_id: typeof entry.target_id === "string" ? entry.target_id : "",
      admin_name: typeof entry.admin_name === "string" ? entry.admin_name : null,
      admin_user_id: typeof entry.admin_user_id === "string" ? entry.admin_user_id : "",
      created_at: entry.created_at,
      detail,
    }];
  });
}

function detailRows(detail: Record<string, Json | undefined>) {
  return Object.entries(detail).filter(([, value]) => value !== null && value !== undefined);
}

export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ targetType: string; targetId: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const [{ targetType, targetId }, query] = await Promise.all([params, searchParams]);
  if (!isTargetType(targetType) || !/^[0-9a-f-]{36}$/i.test(targetId)) notFound();

  const { supabase } = await requireAdmin(`/admin/auditoria/${targetType}/${targetId}`);
  const { data, error } = await supabase.rpc("get_admin_audit_history", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_limit: 50,
  });
  const history = parseHistory(data);
  const backHref = query.volver?.startsWith("/admin") ? query.volver : "/admin";

  return (
    <div className="grid gap-5">
      <header className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">Auditoría administrativa</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-laria-ink">Historial de {adminValueLabel(targetType).toLowerCase()}</h1>
        <p className="mt-2 break-all text-sm text-laria-text-soft">{targetId}</p>
        <Link href={backHref} className="mt-4 inline-flex text-sm font-black text-laria-blue underline-offset-4 hover:underline">Volver al contexto anterior</Link>
      </header>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">No pudimos cargar el historial. No asumiremos que está vacío.</p> : null}
      {!error && !history.length ? <p className="rounded-lg border border-dashed border-laria-steel bg-white p-8 text-center text-sm text-laria-text-soft">No hay acciones administrativas registradas para este objetivo.</p> : null}
      <ol className="grid gap-3">
        {history.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-laria-fog bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <strong className="text-laria-ink">{adminValueLabel(entry.action)}</strong>
              <time className="text-xs text-laria-muted" dateTime={entry.created_at}>{AUDIT_DATE_FORMATTER.format(new Date(entry.created_at))}</time>
            </div>
            <p className="mt-2 text-sm text-laria-text-soft">Admin: {entry.admin_name || entry.admin_user_id}</p>
            {detailRows(entry.detail).length ? (
              <dl className="mt-3 grid gap-1 text-xs text-laria-text-soft sm:grid-cols-2">
                {detailRows(entry.detail).map(([key, value]) => (
                  <div key={key}><dt className="inline font-black">{adminValueLabel(key)}: </dt><dd className="inline break-words">{typeof value === "string" ? adminValueLabel(value) : JSON.stringify(value)}</dd></div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
