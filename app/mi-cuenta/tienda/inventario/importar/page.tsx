import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download } from "lucide-react";
import { ImportStartForm } from "@/components/store-import/import-start";
import { buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { categoryOptions } from "@/lib/listings";
import { importStatus, OPEN_IMPORT_STATUSES } from "@/lib/store-import/labels";

export const metadata = { title: "Importar desde Excel" };

type SessionRow = { id: string; status: string; file_name: string; created_at: string; counts: Record<string, number> | null; result_summary: Record<string, number> | null };

const dateFormat = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });

export default async function StoreImportStartPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store) redirect("/mi-cuenta/tienda");
  const db = supabase as unknown as SupabaseClient | null;
  const [{ data: summary }, { data: sessions }] = db
    ? await Promise.all([
        db.rpc("get_inventory_summary"),
        db.from("store_import_sessions").select("id,status,file_name,created_at,counts,result_summary").eq("store_id", store.id).order("created_at", { ascending: false }).limit(6),
      ])
    : [{ data: null }, { data: [] }];
  const canWrite = Boolean((summary as { can_write?: boolean } | null)?.can_write);
  const rows = (sessions ?? []) as SessionRow[];
  const open = rows.find((session) => OPEN_IMPORT_STATUSES.includes(session.status));
  const history = rows.filter((session) => session !== open).slice(0, 5);

  return (
    <section className="rounded-panel border border-subtle bg-white">
      <PageHeader
        className="border-b border-subtle p-5"
        eyebrow="Inventario"
        title="Importar desde Excel"
        meta="Crea y actualiza tus SKU y su stock desde una hoja de cálculo."
        actions={<Link href="/mi-cuenta/tienda/inventario" className={buttonClasses({ variant: "secondary" })}>Volver al inventario</Link>}
      />
      <div className="grid gap-8 p-5">
        {!canWrite ? (
          <Notice tone="warning" title="El inventario de tu tienda aún no está activo">
            <p>Laria activa el inventario tienda por tienda. Cuando esté activo podrás importar tu archivo aquí.</p>
          </Notice>
        ) : open ? (
          <Notice tone="info" title="Tienes una importación sin terminar">
            <p>{open.file_name} · {importStatus(open.status).label}. Continúa donde la dejaste o cancélala para empezar otra.</p>
            <p className="mt-3"><Link href={`/mi-cuenta/tienda/inventario/importar/${open.id}`}>Continuar importación</Link></p>
          </Notice>
        ) : (
          <div className="grid gap-3">
            <h2 className="t-section">Sube tu archivo</h2>
            <ImportStartForm />
          </div>
        )}

        <div className="grid gap-3">
          <h2 className="t-section">Cómo funciona</h2>
          <ul className="grid list-disc gap-2 pl-5 t-body text-ink">
            <li>Nada cambia hasta que confirmas. Antes verás qué SKU se crean, cuáles se actualizan y qué filas tienen errores.</li>
            <li>El stock del archivo es el total que contaste. Si hoy tienes 12 y el archivo dice 9, Laria registra un ajuste de −3.</li>
            <li>Un SKU que no está en el archivo no se borra ni se pone en cero. Una celda vacía no cambia el valor actual.</li>
            <li>Puedes cerrar la página en cualquier momento; la importación continúa cuando vuelvas.</li>
          </ul>
        </div>

        <form action="/api/store/imports/template" method="get" className="grid gap-3">
          <h2 className="t-section">Plantilla</h2>
          <p className="t-body text-ink-2">Usa nuestra plantilla o tu propio archivo: en el siguiente paso eliges qué columna es cada dato.</p>
          <Field id="plantilla-categoria" label="Columnas de atributos para" optional hint="Agrega las columnas de atributos de una categoría, por ejemplo Tipo de cuerpo para guitarras.">
            <Select name="category" defaultValue="">
              <option value="">Sin atributos</option>
              {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-3">
            <button type="submit" name="format" value="xlsx" className={buttonClasses({ variant: "secondary" })}><Download aria-hidden />Descargar Excel (.xlsx)</button>
            <button type="submit" name="format" value="csv" className={buttonClasses({ variant: "quiet" })}>Descargar CSV</button>
          </div>
        </form>

        {history.length ? (
          <div className="grid gap-3">
            <h2 className="t-section">Importaciones anteriores</h2>
            <ul className="divide-y divide-subtle rounded-panel border border-subtle">
              {history.map((session) => {
                const status = importStatus(session.status);
                const applied = session.result_summary?.applied ?? 0;
                return (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Link href={`/mi-cuenta/tienda/inventario/importar/${session.id}`} className="link font-semibold break-all">{session.file_name}</Link>
                      <p className="t-meta">{dateFormat.format(new Date(session.created_at))}{applied ? ` · ${applied} ${applied === 1 ? "fila aplicada" : "filas aplicadas"}` : ""}</p>
                    </div>
                    <Tag tone={status.tone}>{status.label}</Tag>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
