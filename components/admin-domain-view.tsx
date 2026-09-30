"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AdminInviteUser } from "@/components/admin-invite-user";
import { AdminListingEditor, AdminStoreEditor } from "@/components/admin-record-editors";
import {
  AdminMutationControl,
  AdminRevisionComparison,
  adminDate,
  adminNumber,
  adminString,
} from "@/components/admin-workbench";
import type {
  AdminDomain,
  AdminDomainPayload,
  AdminJsonItem,
} from "@/lib/admin";
import { adminValueLabel } from "@/lib/admin";
import { buttonClasses } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Field, Input, Select } from "@/components/ui/field";
import { noticeClassName } from "@/components/ui/notice";
import { statusLabel, type StatusDomain } from "@/lib/ui/status";
import { Textarea } from "@/components/ui/textarea";

const domainCopy: Record<AdminDomain, { title: string; description: string }> = {
  publicaciones: {
    title: "Publicaciones",
    description: "Busca e inspecciona publicaciones de todos los estados. La moderación conserva el flujo autorizado.",
  },
  revisiones: {
    title: "Cambios de publicaciones",
    description: "Historial y propuestas pendientes con versión, campos cambiados y resolución.",
  },
  tiendas: {
    title: "Tiendas",
    description: "Solicitudes, Tiendas, Tiendas verificadas y estados no públicos.",
  },
  usuarios: {
    title: "Usuarios",
    description: "Inspección operativa de cuentas sin poderes de suplantación, cambio de acceso o eliminación.",
  },
  reportes: {
    title: "Reportes",
    description: "Historial individual de reportes. Resolver o desestimar no modifica el objetivo automáticamente.",
  },
  resenas: {
    title: "Reseñas",
    description: "Reseñas reveladas y su estado de moderación. La calificación y el comentario son inmutables.",
  },
  transacciones: {
    title: "Transacciones",
    description: "Vista de soporte y auditoría; Admin no confirma ni altera relaciones verificadas.",
  },
  legacy: {
    title: "Publicaciones históricas",
    description: "Vinculación manual, explícita y de una sola vez. Nunca se infiere propiedad por teléfono, correo o nombre.",
  },
};

const dictionaryOptions = (domain: StatusDomain, values: string[]) => values.map((value) => ({ value, label: statusLabel(domain, value) }));

const statusOptions: Partial<Record<AdminDomain, { value: string; label: string }[]>> = {
  publicaciones: dictionaryOptions("listing", ["pending", "approved", "rejected", "hidden", "sold", "archived"]),
  revisiones: dictionaryOptions("revision", ["pending", "approved", "rejected", "cancelled"]),
  tiendas: [
    ...dictionaryOptions("store", ["pending", "active"]),
    { value: "verified", label: "Tienda verificada" },
    ...dictionaryOptions("store", ["rejected", "hidden"]),
  ],
  usuarios: [
    { value: "seller", label: "Particular" },
    { value: "store_owner", label: "Tienda" },
  ],
  reportes: dictionaryOptions("report", ["open", "resolved", "dismissed"]),
  resenas: [
    { value: "visible", label: "Visible" },
    { value: "hidden", label: "Oculta" },
  ],
  transacciones: [
    { value: "pending", label: "Pendiente" },
    { value: "verified", label: "Verificada" },
    { value: "declined", label: "Rechazada por comprador" },
    { value: "cancelled", label: "Cancelada" },
    { value: "external", label: "Fuera de Laria" },
  ],
};

const ownerTypeOptions = [
  { value: "individual", label: "Particular" },
  { value: "store", label: "Tienda" },
] as const;

const reportTargetOptions = [
  { value: "listing", label: "Publicación" },
  { value: "store", label: "Tienda" },
  { value: "review", label: "Reseña" },
] as const;

const reportReasonOptions = [
  "posible_estafa",
  "informacion_falsa",
  "articulo_prohibido",
  "contenido_inapropiado",
  "acoso",
  "spam",
  "otro",
] as const;

const statusDomains: Partial<Record<AdminDomain, StatusDomain>> = {
  publicaciones: "listing",
  revisiones: "revision",
  tiendas: "store",
  reportes: "report",
};

function statusText(item: AdminJsonItem, domain: AdminDomain) {
  if (item.is_verified === true && adminString(item, "status") === "active") {
    return "Tienda verificada";
  }
  const status = adminString(item, "status");
  if (!status) return "";
  const dictionary = statusDomains[domain];
  return dictionary ? statusLabel(dictionary, status) : adminValueLabel(status);
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return <p><strong>{label}:</strong> {value}</p>;
}

function DomainActions({ domain, item, onComplete }: { domain: AdminDomain; item: AdminJsonItem; onComplete: (message: string) => void }) {
  const id = adminString(item, "id");
  const status = adminString(item, "status");
  if (!id) return null;

  if (domain === "publicaciones") {
    if (status === "pending") return (
      <div className="flex flex-wrap gap-2">
        <AdminMutationControl mutation={{ kind: "listing", id, decision: "approve" }} label="Aprobar" onComplete={onComplete} />
        <AdminMutationControl mutation={{ kind: "listing", id, decision: "reject" }} label="Rechazar" reasonLabel="Motivo obligatorio" onComplete={onComplete} />
      </div>
    );
    if (status === "approved") return (
      <div className="flex flex-wrap gap-2">
        <AdminMutationControl mutation={{ kind: "listing", id, decision: "hide" }} label="Ocultar" reasonLabel="Motivo obligatorio" onComplete={onComplete} />
        <AdminMutationControl
          mutation={{ kind: "listing", id, decision: "sold" }}
          label="Marcar vendida"
          confirmationText="El registro original quedará como historial vendido e inmutable. Esta acción no confirma comprador, pago, entrega ni una transacción verificada."
          onComplete={onComplete}
        />
      </div>
    );
    if (status === "hidden") return <AdminMutationControl mutation={{ kind: "listing", id, decision: "restore" }} label="Restaurar" onComplete={onComplete} />;
  }
  if (domain === "revisiones" && status === "pending") return (
    <div className="flex flex-wrap gap-2">
      <AdminMutationControl mutation={{ kind: "revision", id, version: adminNumber(item, "version"), decision: "approve" }} label="Aprobar cambios" onComplete={onComplete} />
      <AdminMutationControl mutation={{ kind: "revision", id, version: adminNumber(item, "version"), decision: "reject" }} label="Rechazar cambios" reasonLabel="Motivo obligatorio" onComplete={onComplete} />
    </div>
  );
  if (domain === "tiendas") {
    if (status === "pending") return (
      <div className="flex flex-wrap gap-2">
        <AdminMutationControl mutation={{ kind: "store", id, decision: "approve" }} label="Aprobar como Tienda" onComplete={onComplete} />
        <AdminMutationControl mutation={{ kind: "store", id, decision: "reject" }} label="Rechazar" reasonLabel="Motivo obligatorio" onComplete={onComplete} />
      </div>
    );
    if (status === "active") return (
      <div className="flex flex-wrap gap-2">
        <AdminMutationControl mutation={{ kind: "verification", id, verified: item.is_verified !== true }} label={item.is_verified === true ? "Revocar verificación" : "Verificar tienda"} onComplete={onComplete} />
        <AdminMutationControl mutation={{ kind: "store", id, decision: "hide" }} label="Ocultar tienda" reasonLabel="Motivo obligatorio" onComplete={onComplete} />
      </div>
    );
  }
  if (domain === "reportes" && status === "open") return (
    <div className="flex flex-wrap gap-2">
      <AdminMutationControl mutation={{ kind: "report", id, status: "resolved" }} label="Resolver" reasonLabel="Cómo se resolvió" onComplete={onComplete} />
      <AdminMutationControl mutation={{ kind: "report", id, status: "dismissed" }} label="Desestimar" reasonLabel="Motivo para desestimar" onComplete={onComplete} />
    </div>
  );
  if (domain === "resenas") return <AdminMutationControl mutation={{ kind: "review", id, hidden: !adminString(item, "admin_hidden_at") }} label={adminString(item, "admin_hidden_at") ? "Restaurar reseña" : "Ocultar reseña"} reasonLabel="Motivo obligatorio" onComplete={onComplete} />;
  return null;
}

function DomainCard({ domain, item, onComplete }: { domain: AdminDomain; item: AdminJsonItem; onComplete: (message: string) => void }) {
  const title = adminString(item, "title") || adminString(item, "listing_title") || adminString(item, "target_title") || adminString(item, "name") || adminString(item, "full_name") || "Registro";
  const id = adminString(item, "id") || adminString(item, "claim_id");
  const created = adminString(item, "created_at") || adminString(item, "submitted_at");
  // Current record status for the optimistic editors. Must be declared here: a bare
  // `status` resolves to the browser's window.status and is undefined during SSR.
  const status = adminString(item, "status");
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
  const auditType = domain === "publicaciones"
    ? "listing"
    : domain === "revisiones"
      ? "listing_revision"
      : domain === "tiendas"
        ? "store"
        : domain === "reportes"
          ? "report"
          : domain === "resenas"
            ? "review"
            : "";
  const slug = adminString(item, "slug");
  const publicHref = slug && domain === "publicaciones" && ["approved", "sold"].includes(adminString(item, "status"))
    ? `/instrumentos/${slug}`
    : slug && domain === "tiendas" && adminString(item, "status") === "active"
      ? `/tiendas/${slug}`
      : "";
  const storeInventoryHref = domain === "tiendas" && id
    ? `/admin/publicaciones?propietario=store&buscar=${encodeURIComponent(id)}`
    : "";
  const storeReportsHref = domain === "tiendas" && id
    ? `/admin/reportes?tipo=store&buscar=${encodeURIComponent(id)}`
    : "";
  return (
    <article className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words font-semibold text-ink">{title}</h2>
          <p className="mt-1 break-all text-meta text-ink-2">{id}{created ? ` · ${adminDate(created)}` : ""}</p>
        </div>
        {statusText(item, domain) ? <span className="rounded-tag bg-subtle px-2 py-0.5 t-meta font-semibold text-ink">{statusText(item, domain)}</span> : null}
      </div>
      <div className="grid gap-x-5 gap-y-1 text-sm leading-6 text-ink-2 sm:grid-cols-2">
        <Detail label="Responsable" value={adminString(item, "owner_name")} />
        <Detail label="Tipo" value={adminValueLabel(adminString(item, "seller_type") || adminString(item, "account_type") || targetType)} />
        <Detail label="Categoría" value={adminString(item, "category")} />
        <Detail label="Tipo de instrumento" value={adminString(item, "instrument_type")} />
        <Detail label="Marca / modelo" value={[adminString(item, "brand"), adminString(item, "model")].filter(Boolean).join(" ")} />
        <Detail label="Condición" value={adminString(item, "condition")} />
        <Detail label="Precio" value={adminNumber(item, "price_pen") ? `S/ ${adminNumber(item, "price_pen").toLocaleString("es-PE")}` : ""} />
        <Detail label="Descripción" value={adminString(item, "description")} />
        <Detail label="Fotos" value={item.photo_count as number | undefined} />
        <Detail label="RUC" value={adminString(item, "ruc")} />
        <Detail label="Razón social" value={adminString(item, "razon_social")} />
        <Detail label="Tienda" value={adminString(item, "store_name")} />
        <Detail label="Correo comercial" value={adminString(item, "email")} />
        <Detail label="Teléfono" value={adminString(item, "whatsapp_phone") || adminString(item, "phone")} />
        <Detail label="Persona de contacto" value={adminString(item, "contact_person") || adminString(item, "contact_name")} />
        <Detail label="Dirección" value={adminString(item, "address")} />
        <Detail label="Ubicación" value={[adminString(item, "city"), adminString(item, "region")].filter(Boolean).join(", ")} />
        <Detail label="Fotos de tienda" value={item.store_photo_count as number | undefined} />
        <Detail label="Motivo" value={adminValueLabel(adminString(item, "reason"))} />
        <Detail label="Detalle" value={adminString(item, "detail")} />
        <Detail label="Reportante" value={adminString(item, "reporter_name")} />
        <Detail label="ID de reportante" value={adminString(item, "reporter_user_id")} />
        <Detail label="Resolución" value={adminString(item, "resolution_reason")} />
        <Detail label="Resuelto por" value={adminString(item, "resolved_by_name")} />
        <Detail label="Vendedor" value={adminString(item, "seller_name")} />
        <Detail label="Comprador" value={adminString(item, "buyer_name")} />
        <Detail label="Cuenta" value={adminString(item, "full_name")} />
        <Detail label="Teléfono" value={adminString(item, "phone")} />
        <Detail label="Publicaciones" value={item.listing_count as number | undefined} />
        <Detail label="Reportes históricos" value={item.report_count as number | undefined} />
        <Detail label="Transacciones" value={item.transaction_count as number | undefined} />
        <Detail label="Reseñas vinculadas" value={item.review_count as number | undefined} />
        <Detail label="Transacción" value={adminString(item, "transaction_id")} />
        <Detail label="Publicación vinculada" value={adminString(item, "listing_title")} />
        <Detail label="Reportes abiertos" value={item.open_report_count as number | undefined} />
        <Detail label="Reportes abiertos para el objetivo" value={item.open_target_report_count as number | undefined} />
        <Detail label="Reportes históricos para el objetivo" value={item.target_report_count as number | undefined} />
        <Detail label="Estado del objetivo" value={adminValueLabel(adminString(item, "target_status"))} />
        <Detail label="Responsable del objetivo" value={adminString(item, "target_owner_name")} />
        <Detail label="Campos" value={Array.isArray(item.changed_fields) ? item.changed_fields.filter((value): value is string => typeof value === "string").map(adminValueLabel).join(", ") : ""} />
        <Detail label="Motivo previo" value={adminString(item, "rejection_reason") || adminString(item, "hidden_reason")} />
        <Detail label="Calificación" value={adminNumber(item, "rating") ? `${adminNumber(item, "rating")}/5` : ""} />
        <Detail label="Comentario" value={adminString(item, "comment")} />
        {domain === "revisiones" ? <AdminRevisionComparison item={item} /> : null}
      </div>
      {targetHref || auditType || publicHref || storeInventoryHref || storeReportsHref ? <div className="flex flex-wrap gap-3 text-meta font-semibold">
        {publicHref ? <Link href={publicHref} className="link">Ver página pública</Link> : null}
        {storeInventoryHref ? <Link href={storeInventoryHref} className="link">Ver inventario</Link> : null}
        {storeReportsHref ? <Link href={storeReportsHref} className="link">Ver reportes de la tienda</Link> : null}
        {targetHref ? <Link href={targetHref} className="link">Inspeccionar objetivo</Link> : null}
        {auditType && id ? <Link href={`/admin/auditoria/${auditType}/${id}?volver=${encodeURIComponent(`/admin/${domain}`)}`} className="link">Ver auditoría</Link> : null}
      </div> : null}
      {domain === "publicaciones" && id ? <AdminListingEditor listingId={id} status={status} onComplete={onComplete} /> : null}
      {domain === "tiendas" && id ? (
        <AdminStoreEditor
          storeId={id}
          status={status}
          isVerified={item.is_verified === true}
          onComplete={onComplete}
        />
      ) : null}
      <DomainActions domain={domain} item={item} onComplete={onComplete} />
    </article>
  );
}

function LegacyLinker({ listings, users, onComplete }: { listings: AdminJsonItem[]; users: AdminJsonItem[]; onComplete: (message: string) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [listingId, setListingId] = useState("");
  const [userId, setUserId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLParagraphElement>(null);
  const selectedListing = listings.find((item) => adminString(item, "id") === listingId);
  const selectedUser = users.find((item) => adminString(item, "id") === userId);

  useEffect(() => {
    if (!message) return;
    messageRef.current?.focus();
    messageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !listingId || !userId || !confirmed) {
      setMessage("Selecciona una publicación, una cuenta y confirma la consecuencia.");
      return;
    }
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    if (note.length < 3) {
      setMessage("Escribe una nota de auditoría.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("link_legacy_listing_owner", {
      p_listing_id: listingId,
      p_owner_user_id: userId,
      p_note: note,
    });
    setBusy(false);
    if (error) {
      setMessage("No se pudo vincular. La publicación pudo haber sido vinculada por otro Admin o la cuenta no es elegible.");
      return;
    }
    setListingId("");
    setUserId("");
    setConfirmed(false);
    onComplete("Publicación histórica vinculada una sola vez y registrada en auditoría.");
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <fieldset className="grid gap-2 rounded-panel border border-subtle bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-ink">1. Publicación histórica elegible</legend>
          {listings.map((item) => (
            <label key={adminString(item, "id")} className="flex cursor-pointer gap-3 rounded-control border border-subtle p-3 text-sm">
              <input type="radio" name="listing" value={adminString(item, "id")} checked={listingId === adminString(item, "id")} onChange={() => setListingId(adminString(item, "id"))} />
              <span><strong>{adminString(item, "title")}</strong><br /><span className="text-meta text-ink-2">Contacto histórico: {adminString(item, "historical_contact_name")} · {adminString(item, "historical_whatsapp")}</span></span>
            </label>
          ))}
          {!listings.length ? <p className="text-sm text-ink-2">No hay publicaciones elegibles en esta página.</p> : null}
        </fieldset>
        <fieldset className="grid gap-2 rounded-panel border border-subtle bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-ink">2. Cuenta Particular seleccionada manualmente</legend>
          {users.map((item) => (
            <label key={adminString(item, "id")} className="flex cursor-pointer gap-3 rounded-control border border-subtle p-3 text-sm">
              <input type="radio" name="user" value={adminString(item, "id")} checked={userId === adminString(item, "id")} onChange={() => setUserId(adminString(item, "id"))} />
              <span><strong>{adminString(item, "full_name", "Cuenta sin nombre")}</strong><br /><span className="break-all text-meta text-ink-2">{adminString(item, "phone", "Sin teléfono")} · {adminString(item, "city")} · {adminString(item, "id")}</span></span>
            </label>
          ))}
          {!users.length ? <p className="text-sm text-ink-2">No hay cuentas que coincidan con la búsqueda.</p> : null}
        </fieldset>
      </div>
      <div className="grid gap-3 rounded-panel bg-warning-tint p-4">
        {selectedListing && selectedUser ? <p className="t-ui text-ink">
          Vincularás <strong>{adminString(selectedListing, "title")}</strong>, cuyo contacto histórico es <strong>{adminString(selectedListing, "historical_contact_name")} · {adminString(selectedListing, "historical_whatsapp")}</strong>, con la cuenta <strong>{adminString(selectedUser, "full_name", "sin nombre")} · {adminString(selectedUser, "id")}</strong>. La publicación conservará su ID, estado, fotos e historial; desde entonces usará la resolución dinámica de contacto de la cuenta.
        </p> : <p className="t-ui text-ink-2">Selecciona ambos registros para revisar la consecuencia exacta antes de confirmar.</p>}
        <Field id="legacy-link-note" label="Nota de auditoría">
          <Textarea name="note" required minLength={3} maxLength={500} rows={3} />
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 py-1 t-ui font-semibold text-ink">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ink" />
          Confirmo que revisé la publicación, el contacto histórico y la cuenta elegida. Esta acción no permite reasignación posterior.
        </label>
        {message ? <p ref={messageRef} tabIndex={-1} role="alert" className="t-ui font-semibold text-danger">{message}</p> : null}
        <button type="submit" disabled={busy || !confirmed || !listingId || !userId} className={buttonClasses({ variant: "secondary", className: "w-fit" })}>
          {busy ? "Vinculando…" : "Vincular propietario"}
        </button>
      </div>
    </form>
  );
}

type AdminFilters = {
  search: string;
  status: string;
  ownerType: string;
  targetType: string;
  reason: string;
  userSearch: string;
  userPage: number;
};

function pageHref(domain: AdminDomain, filters: AdminFilters, page: number, userPage = filters.userPage) {
  const params = new URLSearchParams();
  if (filters.search) params.set("buscar", filters.search);
  if (filters.status) params.set("estado", filters.status);
  if (filters.ownerType) params.set("propietario", filters.ownerType);
  if (filters.targetType) params.set("tipo", filters.targetType);
  if (filters.reason) params.set("motivo", filters.reason);
  if (filters.userSearch) params.set("cuenta", filters.userSearch);
  if (page > 1) params.set("pagina", String(page));
  if (userPage > 1) params.set("pagina_cuentas", String(userPage));
  const query = params.toString();
  return `/admin/${domain}${query ? `?${query}` : ""}`;
}

export function AdminDomainView({
  domain,
  payload,
  search,
  status,
  ownerType,
  targetType,
  reason,
  userSearch,
  userPage,
  loadError,
}: {
  domain: AdminDomain;
  payload: AdminDomainPayload | null;
  search: string;
  status: string;
  ownerType: string;
  targetType: string;
  reason: string;
  userSearch: string;
  userPage: number;
  loadError: string | null;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const copy = domainCopy[domain];
  const items = payload?.items ?? [];
  const page = payload?.page ?? 1;
  const pageSize = payload?.page_size ?? 24;
  const total = payload?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const userTotal = payload?.user_total ?? 0;
  const resolvedUserPage = payload?.user_page ?? userPage;
  const userPageCount = Math.max(1, Math.ceil(userTotal / pageSize));
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const filters = { search, status, ownerType, targetType, reason, userSearch, userPage: resolvedUserPage };

  useEffect(() => {
    if (!notice) return;
    noticeRef.current?.focus();
    noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [notice]);

  function complete(message: string) {
    setNotice(message);
    if (items.length === 1 && page > 1) router.replace(pageHref(domain, filters, page - 1));
    else router.refresh();
  }

  return (
    <div className="grid gap-5">
      <header className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <p className="t-micro text-ink-2">Administración</p>
        <h1 className="mt-2 t-page text-ink">{copy.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">{copy.description}</p>
      </header>
      {notice ? <p ref={noticeRef} tabIndex={-1} role="status" className={noticeClassName("success", "font-semibold")}>{notice}</p> : null}
      {loadError ? <p role="alert" className="rounded-control bg-danger-tint p-3 text-sm font-semibold text-danger">{loadError}</p> : null}

      {domain === "usuarios" ? <AdminInviteUser /> : null}

      <form method="get" className="grid gap-3 rounded-panel border border-subtle bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_repeat(3,minmax(150px,220px))_auto] xl:items-end">
        <Field id="admin-buscar" label={domain === "legacy" ? "Buscar publicación histórica" : "Buscar"}>
          <Input type="search" name="buscar" defaultValue={search} maxLength={100} placeholder={domain === "legacy" ? "Título, contacto, teléfono o ID" : "Nombre, título, ID o contexto"} />
        </Field>
        {domain === "legacy" ? <Field id="admin-cuenta" label="Buscar cuenta Particular">
          <Input type="search" name="cuenta" defaultValue={userSearch} maxLength={100} placeholder="Nombre, teléfono o ID" />
        </Field> : null}
        {statusOptions[domain]?.length ? <Field id="admin-estado" label="Estado">
          <Select name="estado" defaultValue={status}>
            <option value="">Todos</option>
            {statusOptions[domain]?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field> : null}
        {domain === "publicaciones" ? <Field id="admin-propietario" label="Tipo de propietario">
          <Select name="propietario" defaultValue={ownerType}>
            <option value="">Todos</option>
            {ownerTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field> : null}
        {domain === "reportes" ? <>
          <Field id="admin-tipo" label="Tipo de objetivo">
            <Select name="tipo" defaultValue={targetType}>
              <option value="">Todos</option>
              {reportTargetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
          <Field id="admin-motivo" label="Motivo">
            <Select name="motivo" defaultValue={reason}>
              <option value="">Todos</option>
              {reportReasonOptions.map((value) => <option key={value} value={value}>{adminValueLabel(value)}</option>)}
            </Select>
          </Field>
        </> : null}
        <button type="submit" className={buttonClasses({ variant: "secondary" })}>Aplicar</button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-2">{total} registro{total === 1 ? "" : "s"}</p>
        <Link href="/admin" className="link t-ui font-semibold">Volver a Moderación</Link>
      </div>

      {domain === "legacy" ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-ink-2">
            <span>{total} publicación{total === 1 ? "" : "es"} histórica{total === 1 ? "" : "s"} elegible{total === 1 ? "" : "s"}</span>
            <span>{userTotal} cuenta{userTotal === 1 ? "" : "s"} Particular coincidente{userTotal === 1 ? "" : "s"}</span>
          </div>
          <LegacyLinker listings={items} users={payload?.users ?? []} onComplete={complete} />
          {userPageCount > 1 ? <nav aria-label="Paginación de cuentas para vinculación" className="flex items-center justify-between rounded-panel border border-subtle bg-white p-3 text-sm">
            {resolvedUserPage > 1 ? <Link className="link font-semibold" href={pageHref(domain, filters, page, resolvedUserPage - 1)}>Cuentas anteriores</Link> : <span />}
            <span className="text-ink-2">Cuentas: página {resolvedUserPage} de {userPageCount}</span>
            {resolvedUserPage < userPageCount ? <Link className="link font-semibold" href={pageHref(domain, filters, page, resolvedUserPage + 1)}>Más cuentas</Link> : <span />}
          </nav> : null}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((item) => <DomainCard key={adminString(item, "id") || adminString(item, "claim_id")} domain={domain} item={item} onComplete={complete} />)}
          {!items.length && !loadError ? <p className="rounded-panel border border-dashed border-line-strong bg-white p-8 text-center text-sm text-ink-2 xl:col-span-2">No hay registros para estos filtros.</p> : null}
        </div>
      )}

      {pageCount > 1 ? <nav aria-label="Paginación administrativa" className="flex items-center justify-between rounded-panel border border-subtle bg-white p-3 text-sm">
        {page > 1 ? <Link className="link font-semibold" href={pageHref(domain, filters, page - 1)}>Anterior</Link> : <span />}
        <span className="text-ink-2">Página {page} de {pageCount}</span>
        {page < pageCount ? <Link className="link font-semibold" href={pageHref(domain, filters, page + 1)}>Siguiente</Link> : <span />}
      </nav> : null}
    </div>
  );
}
