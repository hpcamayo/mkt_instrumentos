"use client";

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { getInstrumentFilterGroup, type InstrumentFilterConfig } from "@/lib/instrument-filters";
import {
  getInstrumentTypeOptions,
  isInstrumentTypeValid,
  sanitizeListingAttributes,
} from "@/lib/listing-submission";
import { normalizePeruRegion } from "@/lib/location";
import { categoryOptions, conditionOptions } from "@/lib/listings";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { Database } from "@/lib/supabase/database.types";
import { buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
type ListingStatus = Database["public"]["Enums"]["listing_status"];

type EditableListing = Pick<
  ListingRow,
  | "title"
  | "category"
  | "instrument_type"
  | "attributes"
  | "brand"
  | "model"
  | "condition"
  | "price_pen"
  | "city"
  | "region"
  | "description"
  | "contact_name"
  | "whatsapp_phone"
>;

type EditableStore = Pick<
  StoreRow,
  | "name"
  | "razon_social"
  | "ruc"
  | "email"
  | "contact_person"
  | "city"
  | "region"
  | "district"
  | "address"
  | "whatsapp_phone"
  | "instagram_url"
  | "facebook_url"
  | "tiktok_url"
  | "website_url"
  | "description"
>;

const EDITABLE_LISTING_STATUSES: ListingStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "hidden",
];

const listingSelect = "title,category,instrument_type,attributes,brand,model,condition,price_pen,city,region,description,contact_name,whatsapp_phone";
const storeSelect = "name,razon_social,ruc,email,contact_person,city,region,district,address,whatsapp_phone,instagram_url,facebook_url,tiktok_url,website_url,description";

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function EditorField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  min,
  maxLength,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "email" | "number" | "text" | "url";
  required?: boolean;
  min?: number;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <Field id={id} label={label}>
      <Input
        type={type}
        value={value}
        required={required}
        min={min}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function EditorSelect({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  required?: boolean;
}) {
  const id = useId();
  return (
    <Field id={id} label={label}>
      <Select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecciona una opción</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </Field>
  );
}

function EditorTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <Field id={id} label={label} className="sm:col-span-2">
      <Textarea value={value} rows={4} maxLength={5000} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function EditorError({ message, errorRef }: { message: string; errorRef: React.RefObject<HTMLParagraphElement | null> }) {
  if (!message) return null;
  return (
    <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-panel bg-danger-tint px-4 py-3 t-ui font-semibold text-danger sm:col-span-2">
      {message}
    </p>
  );
}

function ListingAttributeFields({ listing, onChange }: { listing: EditableListing; onChange: (attributes: ListingRow["attributes"]) => void }) {
  const group = listing.instrument_type ? getInstrumentFilterGroup(listing.instrument_type) : null;
  if (!group) return null;
  const filters = group.filters as readonly InstrumentFilterConfig[];
  const attributes = listing.attributes && typeof listing.attributes === "object" && !Array.isArray(listing.attributes)
    ? listing.attributes as Record<string, unknown>
    : {};

  function update(key: string, value: string | string[] | number | null) {
    const next = { ...attributes };
    if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
    onChange(next as ListingRow["attributes"]);
  }

  return (
    <fieldset className="grid gap-3 rounded-panel border border-subtle bg-canvas p-3 sm:col-span-2">
      <legend className="px-1 t-micro text-ink-2">Atributos del instrumento</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {filters.map((filter) => {
          const raw = attributes[filter.key];
          if (filter.type === "multiselect") {
            const selected = Array.isArray(raw) ? raw.map(String) : [];
            return (
              <fieldset key={filter.key} className="grid gap-1 rounded-panel border border-subtle bg-white p-3">
                <legend className="px-1 t-ui font-semibold text-ink">{filter.label}</legend>
                {filter.options?.map((option) => (
                  <Checkbox
                    key={option.value}
                    label={option.label}
                    className="min-h-0 py-1"
                    checked={selected.includes(option.value)}
                    onChange={(event) => update(
                      filter.key,
                      event.target.checked
                        ? [...selected, option.value]
                        : selected.filter((value) => value !== option.value),
                    )}
                  />
                ))}
              </fieldset>
            );
          }
          if (filter.type === "number") {
            return (
              <EditorField
                key={filter.key}
                label={filter.label}
                type="number"
                min={0}
                value={raw === undefined ? "" : String(raw)}
                onChange={(value) => update(filter.key, value === "" ? null : Number(value))}
              />
            );
          }
          return (
            <EditorSelect
              key={filter.key}
              label={filter.label}
              value={raw === undefined ? "" : String(raw)}
              options={filter.options ?? []}
              onChange={(value) => update(filter.key, value)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

export function AdminListingEditor({
  listingId,
  status,
  onComplete,
}: {
  listingId: string;
  status: string;
  onComplete: (message: string) => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [expanded, setExpanded] = useState(false);
  const [record, setRecord] = useState<EditableListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actionRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const restoreFocusRef = useRef(false);
  const immutable = status === "sold" || status === "archived";
  const mustRemainPublishable = status === "approved";

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  useEffect(() => {
    if (!expanded && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      actionRef.current?.focus();
    }
  }, [expanded]);

  async function open() {
    if (!supabase || busy || immutable) return;
    setExpanded(true);
    setBusy(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("listings")
      .select(listingSelect)
      .eq("id", listingId)
      .single();
    setBusy(false);
    if (loadError || !data) {
      setError("No pudimos cargar los datos editables de la publicación.");
      return;
    }
    setRecord(data as EditableListing);
  }

  function patch(changes: Partial<EditableListing>) {
    setRecord((current) => current ? { ...current, ...changes } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !record || busy) return;

    const normalizedRegion = normalizePeruRegion(record.region);
    const normalizedPhone = digits(record.whatsapp_phone);
    const instrumentType = record.instrument_type ?? "";
    const attributes = sanitizeListingAttributes(instrumentType, record.attributes);
    if (!record.title.trim() || !record.city.trim() || !normalizedRegion) {
      setError("Completa título, ciudad y una región válida de Perú.");
      return;
    }
    if (!isInstrumentTypeValid(record.category, instrumentType) || attributes === null) {
      setError("Revisa el tipo de instrumento y sus atributos.");
      return;
    }
    if (normalizedPhone.length < 9) {
      setError("Ingresa un WhatsApp válido.");
      return;
    }
    if (record.price_pen !== null && (!Number.isFinite(record.price_pen) || record.price_pen < 0)) {
      setError("Ingresa un precio válido o déjalo vacío.");
      return;
    }
    if (mustRemainPublishable && (
      !record.brand?.trim()
      || !record.model?.trim()
      || !record.condition?.trim()
      || record.price_pen === null
      || record.price_pen <= 0
      || (record.description?.trim().length ?? 0) < 40
    )) {
      setError("Una publicación aprobada debe conservar marca, modelo, estado, precio mayor a cero y una descripción de al menos 40 caracteres.");
      return;
    }

    // Deliberate allowlist: status, publication, ownership and trust fields never enter this payload.
    const listingChanges: Database["public"]["Tables"]["listings"]["Update"] = {
      title: record.title.trim(),
      category: record.category,
      instrument_type: instrumentType,
      attributes: attributes,
      brand: nullable(record.brand ?? ""),
      model: nullable(record.model ?? ""),
      condition: nullable(record.condition ?? ""),
      price_pen: record.price_pen,
      city: record.city.trim(),
      region: normalizedRegion,
      description: nullable(record.description ?? ""),
      contact_name: nullable(record.contact_name ?? ""),
      whatsapp_phone: normalizedPhone,
    };

    setBusy(true);
    setError("");
    const { data, error: saveError } = await supabase
      .from("listings")
      .update(listingChanges)
      .eq("id", listingId)
      .eq("status", status as ListingStatus)
      .in("status", EDITABLE_LISTING_STATUSES)
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (saveError) {
      setError("No pudimos guardar los datos permitidos de la publicación.");
      return;
    }
    if (!data) {
      setError("La publicación cambió a vendida o archivada. Actualiza la página antes de continuar.");
      return;
    }

    setExpanded(false);
    setRecord(null);
    onComplete("Datos básicos de la publicación guardados. Estado, propiedad y publicación no fueron modificados.");
  }

  if (immutable) {
    return <p className="text-meta font-semibold text-ink-2">Los datos de una publicación vendida o archivada son inmutables.</p>;
  }

  if (!expanded) {
    return (
      <button ref={actionRef} type="button" onClick={() => void open()} disabled={busy} className="min-h-10 w-fit rounded-control border border-line-strong bg-white px-3 py-2 text-meta font-semibold text-ink hover:bg-canvas disabled:opacity-50">
        {busy ? "Cargando…" : "Editar datos básicos"}
      </button>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-panel border border-subtle bg-canvas p-4 sm:grid-cols-2">
      <h3 className="font-semibold text-ink sm:col-span-2">Editar datos básicos</h3>
      {!record ? <p className="text-sm text-ink-2 sm:col-span-2">{busy ? "Cargando…" : "No hay datos editables disponibles."}</p> : <>
        <EditorField label="Título" value={record.title} required autoFocus onChange={(title) => patch({ title })} />
        <EditorSelect label="Categoría" value={record.category} required options={categoryOptions} onChange={(category) => {
          const types = getInstrumentTypeOptions(category);
          patch({ category, instrument_type: types.length === 1 ? types[0].value : null, attributes: {} });
        }} />
        <EditorSelect label="Tipo de instrumento" value={record.instrument_type ?? ""} required options={getInstrumentTypeOptions(record.category)} onChange={(instrument_type) => patch({ instrument_type, attributes: {} })} />
        <EditorSelect label="Estado del producto" value={record.condition ?? ""} options={conditionOptions.map((value) => ({ value, label: value }))} onChange={(condition) => patch({ condition })} />
        <EditorField label="Marca" value={record.brand ?? ""} onChange={(brand) => patch({ brand })} />
        <EditorField label="Modelo" value={record.model ?? ""} onChange={(model) => patch({ model })} />
        <EditorField label="Precio (S/)" type="number" min={0} value={record.price_pen === null ? "" : String(record.price_pen)} onChange={(value) => patch({ price_pen: value === "" ? null : Number(value) })} />
        <EditorField label="Ciudad" value={record.city} required onChange={(city) => patch({ city })} />
        <EditorField label="Región" value={record.region} required onChange={(region) => patch({ region })} />
        <EditorField label="Nombre de contacto" value={record.contact_name ?? ""} onChange={(contact_name) => patch({ contact_name })} />
        <EditorField label="WhatsApp" value={record.whatsapp_phone} required onChange={(whatsapp_phone) => patch({ whatsapp_phone: digits(whatsapp_phone) })} />
        <EditorTextarea label="Descripción" value={record.description ?? ""} onChange={(description) => patch({ description })} />
        <ListingAttributeFields listing={record} onChange={(attributes) => patch({ attributes })} />
      </>}
      <EditorError message={error} errorRef={errorRef} />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={busy || !record} className={buttonClasses({ variant: "secondary" })}>{busy ? "Guardando…" : "Guardar datos"}</button>
        <button type="button" onClick={() => { restoreFocusRef.current = true; setExpanded(false); setRecord(null); setError(""); }} className="min-h-10 rounded-control border border-line-strong bg-white px-3 py-2 text-meta font-semibold text-ink">Cancelar</button>
      </div>
    </form>
  );
}

export function AdminStoreEditor({
  storeId,
  status,
  isVerified,
  onComplete,
}: {
  storeId: string;
  status: string;
  isVerified: boolean;
  onComplete: (message: string) => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [expanded, setExpanded] = useState(false);
  const [record, setRecord] = useState<EditableStore | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actionRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  useEffect(() => {
    if (!expanded && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      actionRef.current?.focus();
    }
  }, [expanded]);

  async function open() {
    if (!supabase || busy) return;
    setExpanded(true);
    setBusy(true);
    setError("");
    const { data, error: loadError } = await supabase.from("stores").select(storeSelect).eq("id", storeId).single();
    setBusy(false);
    if (loadError || !data) {
      setError("No pudimos cargar los datos editables de la tienda.");
      return;
    }
    setRecord(data as EditableStore);
  }

  function patch(changes: Partial<EditableStore>) {
    setRecord((current) => current ? { ...current, ...changes } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !record || busy) return;
    const region = normalizePeruRegion(record.region);
    const phone = digits(record.whatsapp_phone);
    const ruc = digits(record.ruc ?? "");
    if (!record.name.trim() || !record.city.trim() || !region) {
      setError("Completa nombre, ciudad y una región válida de Perú.");
      return;
    }
    if (phone.length < 9) {
      setError("Ingresa un WhatsApp válido.");
      return;
    }
    if (ruc && ruc.length !== 11) {
      setError("El RUC debe tener 11 dígitos.");
      return;
    }
    if (status === "active" && (
      !record.razon_social?.trim()
      || ruc.length !== 11
      || !record.email?.trim()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)
      || !record.contact_person?.trim()
      || !record.address?.trim()
      || phone.length > 15
    )) {
      setError("Una Tienda activa debe conservar razón social, RUC, correo, contacto, dirección y teléfono válidos.");
      return;
    }

    // Deliberate allowlist: status, verification, plan and ownership never enter this payload.
    const storeChanges: Database["public"]["Tables"]["stores"]["Update"] = {
      name: record.name.trim(),
      razon_social: nullable(record.razon_social ?? ""),
      ruc: ruc || null,
      email: nullable(record.email ?? ""),
      contact_person: nullable(record.contact_person ?? ""),
      city: record.city.trim(),
      region: region,
      district: nullable(record.district ?? ""),
      address: nullable(record.address ?? ""),
      whatsapp_phone: phone,
      instagram_url: nullable(record.instagram_url ?? ""),
      facebook_url: nullable(record.facebook_url ?? ""),
      tiktok_url: nullable(record.tiktok_url ?? ""),
      website_url: nullable(record.website_url ?? ""),
      description: nullable(record.description ?? ""),
    };

    setBusy(true);
    setError("");
    const { data, error: saveError } = await supabase
      .from("stores")
      .update(storeChanges)
      .eq("id", storeId)
      .eq("status", status as StoreRow["status"])
      .eq("is_verified", isVerified)
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (saveError || !data) {
      setError(saveError?.code === "23505"
        ? "Ese RUC ya pertenece a otra tienda. No se guardaron los cambios."
        : "No pudimos guardar los datos permitidos de la tienda.");
      return;
    }

    setExpanded(false);
    setRecord(null);
    onComplete("Datos de negocio y contacto guardados. Estado, verificación, plan y propiedad no fueron modificados.");
  }

  if (!expanded) {
    return (
      <button ref={actionRef} type="button" onClick={() => void open()} disabled={busy} className="min-h-10 w-fit rounded-control border border-line-strong bg-white px-3 py-2 text-meta font-semibold text-ink hover:bg-canvas disabled:opacity-50">
        {busy ? "Cargando…" : "Editar perfil de tienda"}
      </button>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-panel border border-subtle bg-canvas p-4 sm:grid-cols-2">
      <h3 className="font-semibold text-ink sm:col-span-2">Editar datos de negocio y contacto</h3>
      {!record ? <p className="text-sm text-ink-2 sm:col-span-2">{busy ? "Cargando…" : "No hay datos editables disponibles."}</p> : <>
        <EditorField label="Nombre comercial" value={record.name} required autoFocus onChange={(name) => patch({ name })} />
        <EditorField label="Razón social" value={record.razon_social ?? ""} onChange={(razon_social) => patch({ razon_social })} />
        <EditorField label="RUC" value={record.ruc ?? ""} maxLength={11} onChange={(ruc) => patch({ ruc: digits(ruc) })} />
        <EditorField label="Correo comercial" type="email" value={record.email ?? ""} onChange={(email) => patch({ email })} />
        <EditorField label="Persona de contacto" value={record.contact_person ?? ""} onChange={(contact_person) => patch({ contact_person })} />
        <EditorField label="WhatsApp" value={record.whatsapp_phone} required onChange={(whatsapp_phone) => patch({ whatsapp_phone: digits(whatsapp_phone) })} />
        <EditorField label="Ciudad" value={record.city} required onChange={(city) => patch({ city })} />
        <EditorField label="Región" value={record.region} required onChange={(region) => patch({ region })} />
        <EditorField label="Distrito" value={record.district ?? ""} onChange={(district) => patch({ district })} />
        <EditorField label="Dirección" value={record.address ?? ""} onChange={(address) => patch({ address })} />
        <EditorField label="Sitio web" type="url" value={record.website_url ?? ""} onChange={(website_url) => patch({ website_url })} />
        <EditorField label="Instagram" type="url" value={record.instagram_url ?? ""} onChange={(instagram_url) => patch({ instagram_url })} />
        <EditorField label="Facebook" type="url" value={record.facebook_url ?? ""} onChange={(facebook_url) => patch({ facebook_url })} />
        <EditorField label="TikTok" type="url" value={record.tiktok_url ?? ""} onChange={(tiktok_url) => patch({ tiktok_url })} />
        <EditorTextarea label="Descripción" value={record.description ?? ""} onChange={(description) => patch({ description })} />
      </>}
      <EditorError message={error} errorRef={errorRef} />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={busy || !record} className={buttonClasses({ variant: "secondary" })}>{busy ? "Guardando…" : "Guardar datos"}</button>
        <button type="button" onClick={() => { restoreFocusRef.current = true; setExpanded(false); setRecord(null); setError(""); }} className="min-h-10 rounded-control border border-line-strong bg-white px-3 py-2 text-meta font-semibold text-ink">Cancelar</button>
      </div>
    </form>
  );
}
