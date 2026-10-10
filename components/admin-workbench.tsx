"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ADMIN_QUEUE_LABELS,
  ADMIN_QUEUES,
  adminTargetStatusLabel,
  adminValueLabel,
  type AdminCounts,
  type AdminJsonItem,
  type AdminQueue,
  type AdminQueuePayload,
} from "@/lib/admin";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { Json } from "@/lib/supabase/database.types";
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice, noticeClassName } from "@/components/ui/notice";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";

const ADMIN_DATE_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "medium",
  timeStyle: "short",
});

export type AdminMutation =
  | { kind: "listing"; id: string; decision: "approve" | "reject" | "hide" | "restore" | "sold" }
  | { kind: "revision"; id: string; version: number; decision: "approve" | "reject" }
  | { kind: "store"; id: string; decision: "approve" | "reject" | "hide" }
  | { kind: "verification"; id: string; verified: boolean }
  | { kind: "report"; id: string; status: "resolved" | "dismissed" }
  | { kind: "review"; id: string; hidden: boolean };

export function adminString(item: AdminJsonItem, key: string, fallback = "") {
  const value = item[key];
  return typeof value === "string" ? value : fallback;
}

export function adminNumber(item: AdminJsonItem, key: string) {
  const value = Number(item[key]);
  return Number.isFinite(value) ? value : 0;
}

function stringList(item: AdminJsonItem, key: string) {
  const value = item[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

// Approve-like and reject-like decisions look different (UX-7 W2): rejecting, hiding, dismissing and revoking use the
// danger button; approving, verifying and resolving the secondary one. The decision itself is unchanged.
export function isNegativeMutation(mutation: AdminMutation) {
  if (mutation.kind === "verification") return !mutation.verified;
  if (mutation.kind === "report") return mutation.status === "dismissed";
  if (mutation.kind === "review") return mutation.hidden;
  return mutation.decision === "reject" || mutation.decision === "hide";
}

// Verifying or revoking a store changes how all its listings publish, so it asks first (UX-7 W3).
export function verificationConfirmation(verified: boolean) {
  return verified
    ? "La tienda mostrará la marca de Tienda verificada y sus publicaciones nuevas aparecerán sin revisión previa si cumplen las reglas."
    : "La tienda dejará de mostrarse como verificada y sus publicaciones nuevas volverán a pasar por revisión.";
}

export function adminDate(value: string) {
  if (!value) return "Sin fecha";
  return ADMIN_DATE_FORMATTER.format(new Date(value));
}

function jsonRecord(item: AdminJsonItem, key: string) {
  const value = item[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function jsonRecords(item: AdminJsonItem, key: string) {
  const value = item[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, Json | undefined> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

export function AdminRevisionComparison({ item }: { item: AdminJsonItem }) {
  const current = jsonRecord(item, "current_values");
  const proposed = jsonRecord(item, "proposed_values");
  const changed = stringList(item, "changed_fields");
  if (!current || !proposed || !changed.length) return null;
  const fields = [...new Set([...changed.filter((field) => field !== "photos"), "attributes"])];

  return (
    <div className="grid gap-4 sm:col-span-2">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-meta">
        <caption className="mb-2 text-left font-semibold text-ink">Comparación de cambios</caption>
        <thead><tr className="border-b border-subtle"><th className="p-2">Campo</th><th className="p-2">Actual</th><th className="p-2">Propuesto</th></tr></thead>
        <tbody>{fields.map((field) => (
          <tr key={field} className="border-b border-subtle/70">
            <th className="p-2 font-semibold">{adminValueLabel(field)}</th>
            <td className="p-2">{formatRevisionValue(field, current[field], current.instrument_type)}</td>
            <td className="p-2">{formatRevisionValue(field, proposed[field], proposed.instrument_type)}</td>
          </tr>
        ))}</tbody>
      </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RevisionPhotos title="Fotos actuales" photos={jsonRecords(item, "current_photos")} />
        <RevisionPhotos title="Fotos propuestas" photos={changed.includes("photos") ? jsonRecords(item, "proposed_photos") : jsonRecords(item, "current_photos")} />
      </div>
    </div>
  );
}

function formatRevisionValue(field: string, value: Json | undefined, instrumentType: Json | undefined) {
  if (field !== "attributes" || !value || typeof value !== "object" || Array.isArray(value)) {
    return String(value ?? "—");
  }
  const group = getInstrumentFilterGroup(typeof instrumentType === "string" ? instrumentType : "");
  const values = Object.entries(value).flatMap(([key, raw]) => {
    if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && !raw.length)) return [];
    const filter = group?.filters.find((entry) => entry.key === key);
    const formatted = (Array.isArray(raw) ? raw : [raw]).map((entry) => {
      const text = String(entry);
      return filter?.options?.find((option) => option.value === text)?.label ?? (text === "true" ? "Sí" : text === "false" ? "No" : text);
    }).join(", ");
    return [`${filter?.label ?? key.replaceAll("_", " ")}: ${formatted}`];
  });
  return values.length ? values.join("; ") : "Sin características";
}

// A queue photo shown inline (UX-7 W1); it still opens full size in a new tab.
function QueuePhoto({ href, label }: { href: string; label: string }) {
  return (
    <li className="min-w-0">
      <a href={href} target="_blank" rel="noreferrer" className="group grid gap-1 text-meta font-semibold text-ink">
        <Image
          src={href}
          alt={label}
          width={320}
          height={240}
          // Private previews need the Admin browser's authenticated cookies.
          unoptimized={href.startsWith("/api/listing-images/")}
          loading="lazy"
          sizes="(max-width: 639px) 50vw, 200px"
          className="aspect-[4/3] w-full rounded border border-subtle bg-canvas object-cover"
        />
        <span className="link w-fit">Abrir {label.toLowerCase()}</span>
      </a>
    </li>
  );
}

function RevisionPhotos({ title, photos }: { title: string; photos: AdminJsonItem[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {photos.length ? <div className="mt-2 grid grid-cols-2 gap-2">
        {photos.slice(0, 10).map((photo, index) => (
          <Image
            key={adminString(photo, "id", String(index))}
            src={adminString(photo, "image_url")}
            alt={adminString(photo, "alt_text") || `${title} ${index + 1}`}
            width={320}
            height={240}
            // Private previews need the Admin browser's authenticated cookies.
            unoptimized={adminString(photo, "image_url").startsWith("/api/listing-images/")}
            loading="lazy"
            sizes="(max-width: 1023px) 50vw, 320px"
            className="aspect-[4/3] w-full rounded border border-subtle object-cover"
          />
        ))}
      </div> : <p className="mt-2 text-meta text-ink-2">Sin fotos</p>}
    </div>
  );
}

export function AdminMutationControl({
  mutation,
  label,
  reasonLabel,
  confirmationText,
  onComplete,
}: {
  mutation: AdminMutation;
  label: string;
  reasonLabel?: string;
  confirmationText?: string;
  onComplete: (message: string) => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const reasonId = useId();
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (!errorMessage) return;
    feedbackRef.current?.focus();
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [errorMessage]);

  useEffect(() => {
    if (!expanded && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      actionButtonRef.current?.focus();
    }
  }, [expanded]);

  async function execute(reason?: string) {
    if (!supabase || busy) return;
    setBusy(true);
    setErrorMessage("");
    let error: { message: string } | null = null;

    if (mutation.kind === "listing") {
      ({ error } = await supabase.rpc("review_listing", {
        p_listing_id: mutation.id,
        p_decision: mutation.decision,
        p_reason: reason,
      }));
    } else if (mutation.kind === "revision") {
      ({ error } = await supabase.rpc("review_listing_revision", {
        p_revision_id: mutation.id,
        p_decision: mutation.decision,
        p_expected_version: mutation.version,
        p_reason: reason,
      }));
    } else if (mutation.kind === "store") {
      ({ error } = await supabase.rpc("review_store_application", {
        p_store_id: mutation.id,
        p_decision: mutation.decision,
        p_reason: reason,
      }));
    } else if (mutation.kind === "verification") {
      ({ error } = await supabase.rpc("set_store_verification", {
        p_store_id: mutation.id,
        p_verified: mutation.verified,
      }));
    } else if (mutation.kind === "report") {
      ({ error } = await supabase.rpc("moderate_report", {
        p_report_id: mutation.id,
        p_status: mutation.status,
        p_reason: reason ?? "",
      }));
    } else {
      ({ error } = await supabase.rpc("moderate_review", {
        p_review_id: mutation.id,
        p_hidden: mutation.hidden,
        p_reason: reason ?? "",
      }));
    }

    setBusy(false);
    if (error) {
      setErrorMessage(
        error.message.includes("STALE")
          ? "El registro cambió. Actualiza la bandeja antes de decidir."
          : "No pudimos completar la acción. Revisa el estado y vuelve a intentar.",
      );
      return;
    }

    setExpanded(false);
    onComplete("Acción registrada. La bandeja y los conteos fueron actualizados.");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim();
    if (reason.length < 3) {
      setErrorMessage("Escribe un motivo de al menos 3 caracteres.");
      return;
    }
    void execute(reason);
  }

  if (reasonLabel && expanded) {
    return (
      <form
        onSubmit={submit}
        className="grid gap-2 rounded-panel bg-canvas p-3"
      >
        <Field id={reasonId} label={reasonLabel}>
          <Textarea name="reason" required minLength={3} maxLength={500} rows={3} autoFocus />
        </Field>
        {errorMessage ? (
          <p ref={feedbackRef} tabIndex={-1} role="alert" className="text-meta font-semibold text-danger">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className={buttonClasses({ variant: "secondary" })}
          >
            {busy ? "Guardando…" : `Confirmar: ${label}`}
          </button>
          <button
            type="button"
            onClick={() => {
              restoreFocusRef.current = true;
              setExpanded(false);
            }}
            className="min-h-10 rounded-control border border-line-strong px-3 py-2 text-meta font-semibold text-ink"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  if (confirmationText && expanded) {
    return (
      <div className="grid gap-3 rounded-control bg-warning-tint p-3">
        <p className="max-w-xl text-meta font-semibold leading-5 text-ink">{confirmationText}</p>
        {errorMessage ? (
          <p ref={feedbackRef} tabIndex={-1} role="alert" className="text-meta font-semibold text-danger">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void execute()} className={buttonClasses({ variant: "secondary" })}>
            {busy ? "Guardando…" : `Confirmar: ${label}`}
          </button>
          <button
            type="button"
            onClick={() => {
              restoreFocusRef.current = true;
              setExpanded(false);
            }}
            className="min-h-10 rounded-control border border-line-strong bg-white px-3 py-2 text-meta font-semibold text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        ref={actionButtonRef}
        type="button"
        aria-label={`${label}: ${mutation.id}`}
        disabled={busy}
        onClick={() => (reasonLabel || confirmationText ? setExpanded(true) : void execute())}
        className={buttonClasses({ variant: isNegativeMutation(mutation) ? "danger" : "secondary", size: "sm", className: "min-h-10" })}
      >
        {busy ? "Procesando…" : label}
      </button>
      {errorMessage ? (
        <p ref={feedbackRef} tabIndex={-1} role="alert" className="mt-2 max-w-xs text-meta font-semibold text-danger">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function QueueActions({
  queue,
  item,
  onComplete,
}: {
  queue: AdminQueue;
  item: AdminJsonItem;
  onComplete: (message: string) => void;
}) {
  const id = adminString(item, "id");
  if (!id) return null;

  if (queue === "publicaciones") {
    return (
      <div className="flex flex-wrap gap-2">
        <AdminMutationControl
          mutation={{ kind: "listing", id, decision: "approve" }}
          label="Aprobar"
          onComplete={onComplete}
        />
        <AdminMutationControl
          mutation={{ kind: "listing", id, decision: "reject" }}
          label="Rechazar"
          reasonLabel="Motivo obligatorio del rechazo"
          onComplete={onComplete}
        />
      </div>
    );
  }
  if (queue === "revisiones") {
    const version = adminNumber(item, "version");
    return (
      <div className="flex flex-wrap gap-2">
        <AdminMutationControl
          mutation={{ kind: "revision", id, version, decision: "approve" }}
          label="Aprobar cambios"
          onComplete={onComplete}
        />
        <AdminMutationControl
          mutation={{ kind: "revision", id, version, decision: "reject" }}
          label="Rechazar cambios"
          reasonLabel="Motivo obligatorio del rechazo"
          onComplete={onComplete}
        />
      </div>
    );
  }
  if (queue === "tiendas") {
    return (
      <div className="flex flex-wrap gap-2">
        <AdminMutationControl
          mutation={{ kind: "store", id, decision: "approve" }}
          label="Aprobar como Tienda"
          onComplete={onComplete}
        />
        <AdminMutationControl
          mutation={{ kind: "store", id, decision: "reject" }}
          label="Rechazar"
          reasonLabel="Motivo obligatorio del rechazo"
          onComplete={onComplete}
        />
      </div>
    );
  }
  if (queue === "verificacion") {
    return (
      <AdminMutationControl
        mutation={{ kind: "verification", id, verified: true }}
        label="Verificar tienda"
        confirmationText={verificationConfirmation(true)}
        onComplete={onComplete}
      />
    );
  }
  if (queue === "reportes") {
    return (
      <div className="flex flex-wrap gap-2">
        <AdminMutationControl
          mutation={{ kind: "report", id, status: "resolved" }}
          label="Resolver"
          reasonLabel="Cómo se resolvió el reporte"
          onComplete={onComplete}
        />
        <AdminMutationControl
          mutation={{ kind: "report", id, status: "dismissed" }}
          label="Desestimar"
          reasonLabel="Motivo para desestimar"
          onComplete={onComplete}
        />
      </div>
    );
  }
  return (
    <AdminMutationControl
      mutation={{ kind: "review", id, hidden: true }}
      label="Ocultar reseña"
      reasonLabel="Motivo obligatorio para ocultar"
      onComplete={onComplete}
    />
  );
}

function QueueItem({
  queue,
  item,
  onComplete,
}: {
  queue: AdminQueue;
  item: AdminJsonItem;
  onComplete: (message: string) => void;
}) {
  const id = adminString(item, "id");
  const dateKey =
    queue === "revisiones" || queue === "resenas"
      ? "submitted_at"
      : "created_at";
  const createdAt = adminString(item, dateKey);
  const title =
    adminString(item, "title") ||
    adminString(item, "listing_title") ||
    adminString(item, "target_title") ||
    adminString(item, "name") ||
    "Registro de moderación";
  const managementHref = queue === "publicaciones"
    ? `/admin/publicaciones?buscar=${encodeURIComponent(id)}`
    : queue === "revisiones"
      ? `/admin/revisiones?buscar=${encodeURIComponent(adminString(item, "listing_title") || id)}`
      : queue === "tiendas" || queue === "verificacion"
        ? `/admin/tiendas?buscar=${encodeURIComponent(id)}`
        : queue === "reportes"
          ? `/admin/reportes?buscar=${encodeURIComponent(id)}`
          : `/admin/resenas?buscar=${encodeURIComponent(id)}`;
  const targetType = adminString(item, "target_type");
  const targetId = targetType === "listing"
    ? adminString(item, "listing_id")
    : targetType === "store"
      ? adminString(item, "store_id")
      : adminString(item, "review_id");
  const targetHref = targetType === "listing"
    ? `/admin/publicaciones?buscar=${encodeURIComponent(targetId)}`
    : targetType === "store"
      ? `/admin/tiendas?buscar=${encodeURIComponent(targetId)}`
      : targetType === "review"
        ? `/admin/resenas?buscar=${encodeURIComponent(targetId)}`
        : "";
  const auditType = queue === "publicaciones"
    ? "listing"
    : queue === "revisiones"
      ? "listing_revision"
      : queue === "tiendas" || queue === "verificacion"
        ? "store"
        : queue === "reportes"
          ? "report"
          : "review";
  const auditHref = `/admin/auditoria/${auditType}/${id}?volver=${encodeURIComponent(`/admin?cola=${queue}`)}`;
  const firstPhotoUrl = adminString(item, "first_photo_url");
  const storePhotos = jsonRecords(item, "store_photos");

  return (
    <article className="grid gap-4 rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="t-micro text-ink-2">
            {ADMIN_QUEUE_LABELS[queue]}
          </p>
          <h2 className="mt-1 break-words t-section text-ink">
            {title}
          </h2>
          <p className="mt-1 text-meta text-ink-2">
            En espera desde {adminDate(createdAt)}
          </p>
        </div>
        {adminNumber(item, "open_target_report_count") > 1 ? (
          <Tag tone="danger" className="w-fit">
            {adminNumber(item, "open_target_report_count")} reportes abiertos
          </Tag>
        ) : null}
      </div>

      <div className="grid gap-2 text-sm leading-6 text-ink-2 sm:grid-cols-2">
        {adminString(item, "owner_name") ? (
          <p><strong>Responsable:</strong> {adminString(item, "owner_name")}</p>
        ) : null}
        {adminString(item, "seller_type") ? (
          <p><strong>Tipo:</strong> {adminString(item, "seller_type") === "store" ? "Tienda" : "Particular"}</p>
        ) : null}
        {adminString(item, "ruc") ? <p><strong>RUC:</strong> {adminString(item, "ruc")}</p> : null}
        {targetType ? <p><strong>Objetivo:</strong> {adminValueLabel(targetType)}</p> : null}
        {adminString(item, "target_status") ? <p><strong>Estado del objetivo:</strong> {adminTargetStatusLabel(targetType, adminString(item, "target_status"))}</p> : null}
        {adminString(item, "reason") ? <p><strong>Motivo:</strong> {adminValueLabel(adminString(item, "reason"))}</p> : null}
        {adminString(item, "detail") ? <p className="sm:col-span-2"><strong>Detalle:</strong> {adminString(item, "detail")}</p> : null}
        {adminString(item, "reporter_name") ? <p><strong>Reportado por:</strong> {adminString(item, "reporter_name")}</p> : null}
        {adminString(item, "target_owner_name") ? <p><strong>Responsable del objetivo:</strong> {adminString(item, "target_owner_name")}</p> : null}
        {adminString(item, "category") ? <p><strong>Categoría:</strong> {adminString(item, "category")}</p> : null}
        {adminString(item, "brand") || adminString(item, "model") ? <p><strong>Marca / modelo:</strong> {[adminString(item, "brand"), adminString(item, "model")].filter(Boolean).join(" ")}</p> : null}
        {adminString(item, "condition") ? <p><strong>Condición:</strong> {adminString(item, "condition")}</p> : null}
        {adminNumber(item, "price_pen") ? <p><strong>Precio:</strong> S/ {adminNumber(item, "price_pen").toLocaleString("es-PE")}</p> : null}
        {adminString(item, "description") ? <p className="sm:col-span-2"><strong>Descripción:</strong> {adminString(item, "description")}</p> : null}
        {stringList(item, "changed_fields").length ? <p className="sm:col-span-2"><strong>Cambios:</strong> {stringList(item, "changed_fields").map(adminValueLabel).join(", ")}</p> : null}
        <AdminRevisionComparison item={item} />
        {adminNumber(item, "proposed_photo_count") ? <p><strong>Fotos propuestas:</strong> {adminNumber(item, "proposed_photo_count")}</p> : null}
        {adminNumber(item, "photo_count") ? <p><strong>Fotos:</strong> {adminNumber(item, "photo_count")}</p> : null}
        {adminNumber(item, "pending_inventory_count") ? <p><strong>Inventario pendiente:</strong> {adminNumber(item, "pending_inventory_count")}</p> : null}
        {adminString(item, "razon_social") ? <p><strong>Razón social:</strong> {adminString(item, "razon_social")}</p> : null}
        {adminString(item, "email") ? <p><strong>Correo comercial:</strong> {adminString(item, "email")}</p> : null}
        {adminString(item, "whatsapp_phone") ? <p><strong>Teléfono:</strong> {adminString(item, "whatsapp_phone")}</p> : null}
        {adminString(item, "address") ? <p><strong>Dirección:</strong> {adminString(item, "address")}</p> : null}
        {adminString(item, "contact_person") ? <p><strong>Contacto:</strong> {adminString(item, "contact_person")}</p> : null}
        {adminNumber(item, "rating") ? <p><strong>Calificación:</strong> {adminNumber(item, "rating")}/5</p> : null}
        {adminString(item, "comment") ? <p className="sm:col-span-2"><strong>Reseña:</strong> {adminString(item, "comment")}</p> : null}
      </div>

      {firstPhotoUrl || storePhotos.length || adminString(item, "logo_url") || adminString(item, "banner_url") ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Fotos para revisar">
          {firstPhotoUrl ? <QueuePhoto href={firstPhotoUrl} label="Foto principal" /> : null}
          {adminString(item, "logo_url") ? <QueuePhoto href={adminString(item, "logo_url")} label="Logo" /> : null}
          {adminString(item, "banner_url") ? <QueuePhoto href={adminString(item, "banner_url")} label="Banner" /> : null}
          {storePhotos.map((photo, index) => typeof photo.image_url === "string" ? <QueuePhoto key={String(photo.id ?? photo.image_url)} href={photo.image_url} label={`Foto de tienda ${index + 1}`} /> : null)}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-3 text-meta font-semibold">
        <Link href={managementHref} className="link">Abrir en gestión</Link>
        {targetHref ? <Link href={targetHref} className="link">Inspeccionar objetivo</Link> : null}
        <Link href={auditHref} className="link">Ver auditoría</Link>
      </div>
      <p className="text-meta text-ink-2">Identificador: <code className="break-all font-mono text-[13px]">{id}</code></p>

      <QueueActions queue={queue} item={item} onComplete={onComplete} />
    </article>
  );
}

export function AdminWorkbench({
  selectedQueue,
  payload,
  fallbackCounts,
  loadError,
}: {
  selectedQueue: AdminQueue;
  payload: AdminQueuePayload | null;
  fallbackCounts: AdminCounts | null;
  loadError: string | null;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const counts = payload?.counts ?? fallbackCounts;
  const totalPending = counts
    ? Object.values(counts).reduce((sum, value) => sum + value, 0)
    : null;
  const items = payload?.items ?? [];
  const page = payload?.page ?? 1;
  const pageSize = payload?.page_size ?? 20;
  const total = payload?.total ?? counts?.[selectedQueue] ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    if (!notice) return;
    noticeRef.current?.focus();
    noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [notice]);

  function complete(message: string) {
    setNotice(message);
    if (items.length === 1 && page > 1) {
      router.replace(`/admin?cola=${selectedQueue}&pagina=${page - 1}`);
    } else {
      router.refresh();
    }
  }

  function moveTab(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % ADMIN_QUEUES.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + ADMIN_QUEUES.length) % ADMIN_QUEUES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ADMIN_QUEUES.length - 1;
    else return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Moderación"
          title="Bandeja de moderación"
          meta={totalPending === null
            ? "Los conteos no están disponibles. Actualiza antes de asumir que no hay trabajo."
            : totalPending > 0
            ? `${totalPending} ${totalPending === 1 ? "acción requiere" : "acciones requieren"} atención.`
            : "No hay acciones pendientes."}
        />
        <div
          className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-meta font-semibold text-ink-2"
          aria-label="Resumen de pendientes"
        >
          {ADMIN_QUEUES.map((queue) => (
            <span key={queue}>{ADMIN_QUEUE_LABELS[queue]}: {counts?.[queue] ?? "—"}</span>
          ))}
        </div>
      </div>

      {notice ? (
        <p ref={noticeRef} tabIndex={-1} role="status" className={noticeClassName("success", "font-semibold")}>
          {notice}
        </p>
      ) : null}
      {loadError ? <Notice tone="danger" role="alert">{loadError}</Notice> : null}

      <div className="overflow-x-auto rounded-panel border border-subtle bg-white p-2">
        <div role="tablist" aria-label="Colas de moderación" className="flex min-w-max gap-1">
          {ADMIN_QUEUES.map((queue, index) => {
            const active = queue === selectedQueue;
            return (
              <Link
                key={queue}
                id={`tab-${queue}`}
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${queue}`}
                tabIndex={active ? 0 : -1}
                ref={(node) => { tabRefs.current[index] = node; }}
                onKeyDown={(event) => moveTab(event, index)}
                href={`/admin?cola=${queue}`}
                className={active
                  ? "rounded-control bg-frame px-3 py-2.5 text-sm font-semibold text-white"
                  : "rounded-control px-3 py-2.5 text-sm font-semibold text-ink-2 hover:bg-canvas"}
              >
                {ADMIN_QUEUE_LABELS[queue]} <span aria-label={`${counts?.[queue] ?? "sin conteo"} pendientes`}>{counts?.[queue] ?? "—"}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <section
        id={`panel-${selectedQueue}`}
        role="tabpanel"
        aria-labelledby={`tab-${selectedQueue}`}
        className="grid gap-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="t-section text-ink">{ADMIN_QUEUE_LABELS[selectedQueue]}</h2>
            <p className="mt-1 text-sm text-ink-2">{total} pendiente{total === 1 ? "" : "s"} en esta cola.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
            Actualizar
          </Button>
        </div>

        {items.map((item) => (
          <QueueItem
            key={adminString(item, "id")}
            queue={selectedQueue}
            item={item}
            onComplete={complete}
          />
        ))}
        {!items.length && !loadError ? (
          <EmptyState headingLevel={3} title="No hay acciones pendientes" description="Esta cola está al día." />
        ) : null}

        {pageCount > 1 ? (
          <nav aria-label="Paginación de la cola" className="flex items-center justify-between gap-3 rounded-panel border border-subtle bg-white p-3 text-sm">
            {page > 1 ? <Link href={`/admin?cola=${selectedQueue}&pagina=${page - 1}`} className="link font-semibold">Anterior</Link> : <span />}
            <span className="text-ink-2">Página {page} de {pageCount}</span>
            {page < pageCount ? <Link href={`/admin?cola=${selectedQueue}&pagina=${page + 1}`} className="link font-semibold">Siguiente</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
