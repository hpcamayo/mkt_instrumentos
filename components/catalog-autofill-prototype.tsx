"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildProvenance,
  createLatestRequestGuard,
  sameValue,
  type AutofillSuggestion,
  type CandidateView,
  type FieldKey,
  type LookupResult,
  type OmittedReason,
  type SellerMatchAction,
} from "@/lib/catalog-intelligence/autofill";
import { getInstrumentFilterGroup, type InstrumentFilterConfig } from "@/lib/instrument-filters";
import { getInstrumentTypeOptions, type ListingAttributeValue } from "@/lib/listing-submission";
import { categoryOptions, conditionOptions } from "@/lib/listings";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";

// Prototype only (app/prototipos/autofill). It mirrors the publication form's identity and attribute fields so the
// autofill rules can be tried with the real catalog; it never submits a listing.

type Selection = {
  suggestion: AutofillSuggestion;
  variants: { id: string; name: string; configuration: string | null; color: string | null }[];
  variantAttributes: string[];
};

type EvaluationResponse = {
  record: {
    outcome: string;
    gates: { id: string; passed: boolean; detail: string }[];
    selected: { option: string; product_id: string | null; probability: number | null } | null;
    provider: { id: string; model: string; mock: boolean; request_id: string | null } | null;
    latency_ms: number | null;
    attempts: number;
    failure: string | null;
    catalog: { decision: string; tier: string; reasons: string[] };
    threshold_source: string | null;
    input_hash: string;
  } | null;
  packet?: unknown;
  transition?: { action: string; reason?: string };
  killed?: boolean;
  message?: string;
};

const KIND_COPY: Record<LookupResult["kind"], { title: string; body: string }> = {
  exact: { title: "Coincidencia exacta del modelo", body: "Revisa los datos del catálogo antes de usarlos." },
  family: { title: "Encontramos la línea, no el modelo exacto", body: "Elige el modelo para completar más datos. Con la línea solo sugerimos la categoría." },
  ambiguous: { title: "Hay varios modelos posibles", body: "Elige el tuyo. No elegimos uno por ti." },
  conflicting: { title: "La marca y el modelo no coinciden en el catálogo", body: "Corrige la marca, elige otro modelo o mantén lo que escribiste." },
  approximate: { title: "Sugerencias aproximadas", body: "Ninguna coincide con seguridad. Elige una solo si es tu instrumento." },
  unknown: { title: "No encontramos este modelo en el catálogo", body: "Puedes seguir completando el formulario como siempre. Un administrador lo revisará." },
};

const OMITTED_COPY: Record<OmittedReason, string> = {
  untrusted: "dato sin confirmar en el catálogo",
  conflict: "las fuentes no coinciden",
  variant_dependent: "depende de la versión: elige una",
  family_level: "elige el modelo exacto",
  not_in_form: "no corresponde a un campo del formulario",
  category_mismatch: "el tipo no corresponde a la categoría",
};

const OUTCOME_COPY: Record<string, string> = {
  AUTO_APPROVE: "Calificaría para aprobación automática",
  REVIEW: "Revisión normal de un administrador",
  INSUFFICIENT: "Faltan datos: revisión normal",
  CONFLICTING: "Datos contradictorios: revisión con evidencia",
  SYSTEM_FAILURE: "Falla del sistema: revisión normal",
};

const GATE_COPY: Record<string, string> = {
  submission_valid: "Cumple las reglas de publicación",
  seller_in_scope: "Tipo de cuenta incluido",
  new_listing: "Publicación nueva (no cambios)",
  catalog_identity: "Modelo identificado por el catálogo",
  catalog_detailed: "Modelo con datos completos en el catálogo",
  catalog_product_ready: "Modelo verificado y listo en el catálogo",
  category_consistent: "Categoría y tipo coinciden con el catálogo",
  identity_consistent: "Sin réplicas, segundo modelo ni dudas de generación o medida",
  identity_not_edited: "Marca, modelo y categoría sin cambios tras autocompletar",
  text_signals_clean: "Texto sin enlaces, contactos ni instrucciones",
  provider_valid: "Respuesta válida del evaluador",
  thresholds_present: "Umbrales definidos",
  jev_choice: "Jev eligió el mismo modelo con seguridad",
  jev_sufficient: "Evidencia suficiente según Jev",
  jev_no_conflict: "Sin contradicciones según Jev",
  jev_detail: "Detalle suficiente para un comprador",
  jev_text_clean: "Texto sin señales de spam",
};

const TRANSITION_COPY: Record<string, string> = {
  publish: "Se publicaría",
  not_auto_approve: "No cambia nada: sigue en revisión",
  shadow_mode: "Modo sombra: no cambia nada",
  mock_provider: "Proveedor de prueba: nunca publica",
  demo_thresholds: "Umbrales sin calibrar: nunca publica",
  stale_version: "La publicación cambió después de evaluarla: el resultado se descarta",
  not_pending: "Ya no está en revisión",
  admin_decided: "Un administrador ya decidió",
  already_applied: "Otra evaluación ya se aplicó",
};

export function CatalogAutofillPrototype({ provider }: { provider: "mock" | "gateway" }) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "error">("idle");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [variantId, setVariantId] = useState("");
  const [action, setAction] = useState<SellerMatchAction>("none");
  const [rejectedProductId, setRejectedProductId] = useState<string | null>(null);
  const [resolvedAt, setResolvedAt] = useState<Date | null>(null);
  const [applied, setApplied] = useState<AutofillSuggestion | null>(null);
  const [category, setCategory] = useState("");
  const [instrumentType, setInstrumentType] = useState("");
  const [attributes, setAttributes] = useState<Record<string, ListingAttributeValue>>({});
  const [unit, setUnit] = useState({ title: "", condition: "", price: "", description: "", photos: "2", city: "Lima", region: "Lima" });
  const [scenario, setScenario] = useState("normal");
  const [thresholds, setThresholds] = useState("demo");
  const [sellerKind, setSellerKind] = useState("particular");
  const [simulate, setSimulate] = useState("none");
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const guard = useRef(createLatestRequestGuard());
  const rawClaims = useRef({ brand: "", model: "" });

  // Debounced lookup. Only the newest request may write: an older, slower answer is dropped (spec §7).
  useEffect(() => {
    const token = guard.current.next();
    // Suggestions for the previous text disappear at once, so they cannot be picked for the new text.
    setLookup(null);
    setSelection(null);
    if (model.trim().length < 2) {
      setLookupState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookupState("loading");
      try {
        const response = await fetch(`/api/catalog/suggestions?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`, { signal: controller.signal });
        const body = await response.json();
        if (!guard.current.isLatest(token)) return;
        if (!response.ok) throw new Error(body.message);
        setLookup(body.lookup);
        setLookupState("idle");
      } catch {
        if (guard.current.isLatest(token) && !controller.signal.aborted) setLookupState("error");
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [brand, model]);

  async function choose(productId: string, variant = "") {
    if (action === "none" || !applied) rawClaims.current = { brand, model };
    const response = await fetch(`/api/catalog/products/${productId}${variant ? `?variant=${variant}` : ""}`);
    if (!response.ok) return;
    const body = await response.json();
    setSelection({ suggestion: body.suggestion, variants: body.variants, variantAttributes: body.variantAttributes });
    setVariantId(variant);
  }

  function applySelection() {
    if (!selection) return;
    const values = Object.fromEntries(selection.suggestion.suggestions.map((item) => [item.field, item.value]));
    if (!applied) rawClaims.current = { brand, model };
    if (typeof values.brand === "string") setBrand(values.brand);
    if (typeof values.model === "string") setModel(values.model);
    const nextCategory = typeof values.category === "string" ? values.category : category;
    setCategory(nextCategory);
    const nextType = typeof values.instrument_type === "string" ? values.instrument_type : getInstrumentTypeOptions(nextCategory).length === 1 ? getInstrumentTypeOptions(nextCategory)[0].value : "";
    setInstrumentType(nextType);
    const nextAttributes: Record<string, ListingAttributeValue> = {};
    for (const item of selection.suggestion.suggestions) {
      if (item.field.startsWith("attribute:")) nextAttributes[item.field.slice("attribute:".length)] = item.value;
    }
    setAttributes(nextAttributes);
    setApplied(selection.suggestion);
    setAction("accepted");
    setResolvedAt(new Date());
    setRejectedProductId(null);
    setSelection(null);
  }

  function reject(productId: string | null) {
    if (!applied) rawClaims.current = { brand, model };
    setAction("rejected");
    setResolvedAt(new Date());
    setRejectedProductId(productId);
    setApplied(null);
    setSelection(null);
  }

  const suggested = useMemo(() => new Map((applied?.suggestions ?? []).map((item) => [item.field, item.value])), [applied]);
  const finalValues: Partial<Record<FieldKey, ListingAttributeValue | undefined>> = {
    brand,
    model,
    category,
    instrument_type: instrumentType,
    ...Object.fromEntries(Object.entries(attributes).map(([key, value]) => [`attribute:${key}`, value])),
  };
  const provenance = buildProvenance({
    rawClaims: action === "none" ? { brand, model } : rawClaims.current,
    lookup,
    action,
    suggestion: applied,
    rejectedProductId,
    finalValues,
    resolvedAt,
  });

  function origin(field: FieldKey) {
    if (!suggested.has(field)) return null;
    return sameValue(suggested.get(field), finalValues[field]) ? <Tag tone="accent">Autocompletado del catálogo</Tag> : <Tag tone="neutral">Modificado por ti</Tag>;
  }

  async function evaluate() {
    setEvaluating(true);
    setEvaluation(null);
    try {
      const response = await fetch("/api/catalog/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: unit.title,
          brand,
          model,
          category,
          instrument_type: instrumentType,
          attributes,
          condition: unit.condition,
          price_pen: Number(unit.price),
          description: unit.description,
          photo_count: Number(unit.photos),
          city: unit.city,
          region: unit.region,
          autofill: provenance,
          seller_kind: sellerKind,
          scenario,
          thresholds,
          simulate,
        }),
      });
      setEvaluation(await response.json());
    } catch {
      setEvaluation({ record: null, message: "No se pudo evaluar. Intenta nuevamente." });
    } finally {
      setEvaluating(false);
    }
  }

  // After "Usar estos datos" the canonical names are in the fields; the lookup list returns only if they change.
  const settled = action === "accepted" && suggested.get("brand") === brand && suggested.get("model") === model;
  const filters = instrumentType ? getInstrumentFilterGroup(instrumentType)?.filters ?? [] : [];
  const kindCopy = lookup ? KIND_COPY[lookup.kind] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="grid gap-6 rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <section className="grid gap-4" aria-labelledby="identidad">
          <h2 id="identidad" className="t-section text-ink">1. Identifica el instrumento</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="proto-brand" label={<span className="inline-flex flex-wrap items-center gap-2">Marca {origin("brand")}</span>}>
              <Input value={brand} onChange={(event) => setBrand(event.target.value)} autoComplete="off" />
            </Field>
            <Field id="proto-model" label={<span className="inline-flex flex-wrap items-center gap-2">Modelo {origin("model")}</span>}>
              <Input value={model} onChange={(event) => setModel(event.target.value)} autoComplete="off" />
            </Field>
          </div>
          <div aria-live="polite" className="grid gap-3">
            {lookupState === "loading" ? <p className="t-meta">Buscando en el catálogo…</p> : null}
            {lookupState === "error" ? <Notice tone="danger">No se pudo consultar el catálogo. Puedes seguir sin autocompletar.</Notice> : null}
            {lookup && kindCopy && !selection && !settled ? (
              <Notice tone={lookup.kind === "conflicting" ? "warning" : "info"} title={kindCopy.title}>
                <p>
                  {lookup.kind === "conflicting" && lookup.conflict
                    ? `Escribiste «${brand}», pero en el catálogo «${lookup.conflict.catalogModel}» es de ${lookup.conflict.catalogManufacturer}. `
                    : null}
                  {kindCopy.body}
                </p>
                {lookup.candidates.length ? (
                  <ul className="mt-3 grid gap-2">
                    {lookup.candidates.map((candidate) => (
                      <CandidateRow key={candidate.productId} candidate={candidate} isTop={candidate.productId === lookup.topProductId} onChoose={() => choose(candidate.productId)} />
                    ))}
                  </ul>
                ) : null}
                {lookup.kind !== "unknown" ? (
                  <Button variant="quiet" size="sm" className="mt-3" onClick={() => reject(lookup.topProductId)}>
                    Ninguno es mi instrumento: seguir sin catálogo
                  </Button>
                ) : null}
              </Notice>
            ) : null}
            {selection ? (
              <SelectionPreview
                selection={selection}
                variantId={variantId}
                onVariant={(id) => choose(selection.suggestion.productId, id)}
                onFamilyModel={(id) => choose(id)}
                onApply={applySelection}
                onReject={() => reject(selection.suggestion.productId)}
              />
            ) : null}
            {action === "rejected" ? <p className="t-meta">Seguiste sin el catálogo. Completa los datos a mano; la publicación pasa por la revisión de siempre.</p> : null}
          </div>
        </section>

        <section className="grid gap-4" aria-labelledby="clasificacion">
          <h2 id="clasificacion" className="t-section text-ink">2. Categoría y características</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="proto-category" label={<span className="inline-flex flex-wrap items-center gap-2">Categoría {origin("category")}</span>}>
              <Select value={category} onChange={(event) => { setCategory(event.target.value); setInstrumentType(""); setAttributes({}); }}>
                <option value="">Selecciona una opción</option>
                {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
            <Field id="proto-type" label={<span className="inline-flex flex-wrap items-center gap-2">Tipo de instrumento {origin("instrument_type")}</span>}>
              <Select value={instrumentType} disabled={!category} onChange={(event) => { setInstrumentType(event.target.value); setAttributes({}); }}>
                <option value="">Selecciona una opción</option>
                {getInstrumentTypeOptions(category).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
          </div>
          {filters.length ? (
            <fieldset className="grid gap-4 rounded-panel border border-subtle bg-canvas p-4 sm:grid-cols-2">
              <legend className="px-2 t-ui font-semibold text-ink">Características del modelo <span className="font-normal text-ink-2">(opcionales)</span></legend>
              {filters.map((filter) => (
                <AttributeControl
                  key={filter.key}
                  filter={filter}
                  value={attributes[filter.key]}
                  badge={origin(`attribute:${filter.key}`)}
                  onChange={(value) => setAttributes((current) => {
                    const next = { ...current };
                    if (value === undefined) delete next[filter.key];
                    else next[filter.key] = value;
                    return next;
                  })}
                />
              ))}
            </fieldset>
          ) : null}
          {applied ? <p className="t-meta">Los datos autocompletados describen el modelo del catálogo, no tu instrumento: revísalos y corrígelos si tu unidad es distinta.</p> : null}
        </section>

        <section className="grid gap-4" aria-labelledby="unidad">
          <h2 id="unidad" className="t-section text-ink">3. Tu instrumento</h2>
          <p className="t-meta">Estos datos siempre los escribe quien vende: el catálogo no los conoce.</p>
          <Field id="proto-title" label="Título"><Input value={unit.title} onChange={(event) => setUnit({ ...unit, title: event.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="proto-condition" label="Condición">
              <Select value={unit.condition} onChange={(event) => setUnit({ ...unit, condition: event.target.value })}>
                <option value="">Selecciona una opción</option>
                {conditionOptions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
              </Select>
            </Field>
            <Field id="proto-price" label="Precio en soles"><Input inputMode="numeric" value={unit.price} onChange={(event) => setUnit({ ...unit, price: event.target.value })} /></Field>
            <Field id="proto-photos" label="Fotos (cantidad simulada)" hint="El prototipo no sube fotos; solo cuenta cuántas tendría.">
              <Input inputMode="numeric" value={unit.photos} onChange={(event) => setUnit({ ...unit, photos: event.target.value })} />
            </Field>
            <Field id="proto-city" label="Ciudad"><Input value={unit.city} onChange={(event) => setUnit({ ...unit, city: event.target.value })} /></Field>
          </div>
          <Field id="proto-description" label="Descripción" hint="Mínimo 40 caracteres. Estado real, accesorios incluidos, reparaciones y modificaciones.">
            <Textarea rows={5} value={unit.description} onChange={(event) => setUnit({ ...unit, description: event.target.value })} />
          </Field>
        </section>
      </div>

      <aside className="grid content-start gap-6">
        <section className="grid gap-3 rounded-panel border border-subtle bg-white p-5" aria-labelledby="origen">
          <h2 id="origen" className="t-section text-ink">Origen de los datos</h2>
          <dl className="grid gap-2 t-ui">
            <Row label="Marca y modelo escritos">{provenance.raw_claims.brand || "—"} · {provenance.raw_claims.model || "—"}</Row>
            <Row label="Modelo del catálogo">{provenance.catalog_product_id ? applied?.suggestions.find((item) => item.field === "model")?.display : "Ninguno"}</Row>
            <Row label="Decisión">{{ none: "Sin elegir", accepted: "Aceptó la sugerencia", rejected: "Rechazó la sugerencia" }[provenance.seller_action]}</Row>
            <Row label="Aceptados">{provenance.accepted.length}</Row>
            <Row label="Modificados">{provenance.modified.length ? provenance.modified.map(fieldLabel).join(", ") : "Ninguno"}</Row>
          </dl>
          <details className="t-meta">
            <summary className="cursor-pointer font-semibold text-ink">Ver el registro completo</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-control bg-canvas p-3 text-[12px] leading-5">{JSON.stringify(provenance, null, 2)}</pre>
          </details>
        </section>

        <section className="grid gap-4 rounded-panel border border-subtle bg-white p-5" aria-labelledby="jev">
          <h2 id="jev" className="t-section text-ink">Evaluación de Jev (sombra)</h2>
          {provider === "mock" ? <Tag tone="warning">Proveedor de prueba: no es Jev</Tag> : <Tag tone="line">AI Gateway</Tag>}
          <Field id="proto-seller" label="Tipo de cuenta">
            <Select value={sellerKind} onChange={(event) => setSellerKind(event.target.value)}>
              <option value="particular">Particular</option>
              <option value="store">Tienda</option>
              <option value="verified_store">Tienda verificada</option>
            </Select>
          </Field>
          <Field id="proto-scenario" label="Escenario del evaluador">
            <Select value={scenario} onChange={(event) => setScenario(event.target.value)}>
              <option value="normal">Respuesta normal</option>
              <option value="ambiguous_scores">Respuesta dudosa</option>
              <option value="timeout">Sin respuesta a tiempo</option>
              <option value="error">Error del proveedor</option>
              <option value="invalid">Respuesta inválida</option>
            </Select>
          </Field>
          <Field id="proto-thresholds" label="Umbrales">
            <Select value={thresholds} onChange={(event) => setThresholds(event.target.value)}>
              <option value="demo">De demostración (sin calibrar)</option>
              <option value="none">Ninguno (como producción hoy)</option>
            </Select>
          </Field>
          <Field id="proto-simulate" label="Después de evaluar">
            <Select value={simulate} onChange={(event) => setSimulate(event.target.value)}>
              <option value="none">Nada cambia</option>
              <option value="edited_after">Quien vende edita la publicación</option>
              <option value="admin_decided">Un administrador ya decidió</option>
            </Select>
          </Field>
          <Button onClick={evaluate} loading={evaluating} loadingLabel="Evaluando...">Evaluar en modo sombra</Button>
          {evaluation ? <EvaluationResult result={evaluation} /> : null}
        </section>
      </aside>
    </div>
  );
}

function CandidateRow({ candidate, isTop, onChoose }: { candidate: CandidateView; isTop: boolean; onChoose: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-white p-3">
      <span className="min-w-0">
        <span className="block font-semibold">{candidate.manufacturer} {candidate.model}</span>
        <span className="block t-meta">
          {candidate.categoryLabel ?? "Sin categoría"} · {candidate.strength === "family" ? "Línea de modelos" : candidate.strength === "model" ? "Modelo" : "Aproximada"}
          {isTop ? " · la más probable" : ""}
        </span>
      </span>
      <Button variant="secondary" size="sm" onClick={onChoose}>Ver datos</Button>
    </li>
  );
}

function SelectionPreview({ selection, variantId, onVariant, onFamilyModel, onApply, onReject }: {
  selection: Selection;
  variantId: string;
  onVariant: (id: string) => void;
  onFamilyModel: (id: string) => void;
  onApply: () => void;
  onReject: () => void;
}) {
  const { suggestion } = selection;
  if (suggestion.blockedReason) {
    return <Notice tone="warning" title="Este modelo no se puede usar para autocompletar">El catálogo lo tiene marcado para revisión. Sigue sin catálogo.</Notice>;
  }
  return (
    <div className="grid gap-3 rounded-panel border border-subtle bg-canvas p-4">
      <p className="t-ui font-semibold text-ink">Datos que propone el catálogo</p>
      <ul className="grid gap-1 t-ui">
        {suggestion.suggestions.map((item) => (
          <li key={item.field}><span className="text-ink-2">{fieldLabel(item.field)}:</span> {item.display}{item.source === "variant" ? " (de la versión elegida)" : ""}</li>
        ))}
      </ul>
      {suggestion.variantInfo.length ? <p className="t-meta">Versión: {suggestion.variantInfo.map((item) => `${item.label} ${item.value}`).join(" · ")} (informativo, no se completa)</p> : null}
      {suggestion.omitted.length ? (
        <details className="t-meta">
          <summary className="cursor-pointer">No se completan {suggestion.omitted.length} datos</summary>
          <ul className="mt-1 grid gap-0.5">{suggestion.omitted.map((item) => <li key={`${item.key}-${item.reason}`}>{fieldLabel(`attribute:${item.key}`)}: {OMITTED_COPY[item.reason]}</li>)}</ul>
        </details>
      ) : null}
      {suggestion.familyModels.length ? (
        <Field id="proto-family-model" label="Elige el modelo exacto">
          <Select defaultValue="" onChange={(event) => event.target.value && onFamilyModel(event.target.value)}>
            <option value="">Selecciona un modelo</option>
            {suggestion.familyModels.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}
          </Select>
        </Field>
      ) : null}
      {selection.variants.length && selection.variantAttributes.length ? (
        <Field id="proto-variant" label="Versión" hint="Algunos datos cambian según la versión. Elige la tuya para completarlos." optional>
          <Select value={variantId} onChange={(event) => onVariant(event.target.value)}>
            <option value="">Sin elegir</option>
            {selection.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onApply}>Usar estos datos</Button>
        <Button size="sm" variant="secondary" onClick={onReject}>No es mi instrumento</Button>
      </div>
      <p className="t-meta">El autocompletado indica de dónde viene cada dato; no verifica tu instrumento.</p>
    </div>
  );
}

function AttributeControl({ filter, value, badge, onChange }: {
  filter: InstrumentFilterConfig;
  value: ListingAttributeValue | undefined;
  badge: ReactNode;
  onChange: (value: ListingAttributeValue | undefined) => void;
}) {
  const label = <span className="inline-flex flex-wrap items-center gap-2">{filter.label} {badge}</span>;
  if (filter.type === "multiselect") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <fieldset className="grid gap-1">
        <legend className="t-ui font-semibold text-ink">{label}</legend>
        {filter.options?.map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            className="min-h-0 py-1"
            checked={selected.includes(option.value)}
            onChange={(event) => {
              const next = event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value);
              onChange(next.length ? next : undefined);
            }}
          />
        ))}
      </fieldset>
    );
  }
  return (
    <Field id={`proto-attr-${filter.key}`} label={label}>
      <Select value={value === undefined ? "" : String(value)} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">Sin indicar</option>
        {filter.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </Field>
  );
}

function EvaluationResult({ result }: { result: EvaluationResponse }) {
  if (result.killed) return <Notice tone="info">Jev está desactivado con el interruptor de emergencia. La moderación sigue igual.</Notice>;
  if (!result.record) return <Notice tone="danger">{result.message ?? "No hubo evaluación."}</Notice>;
  const record = result.record;
  return (
    <div className="grid gap-3" aria-live="polite">
      <Notice tone={record.outcome === "AUTO_APPROVE" ? "success" : record.outcome === "CONFLICTING" ? "warning" : "info"} title={OUTCOME_COPY[record.outcome] ?? record.outcome}>
        {record.provider?.mock ? "Resultado de un proveedor de prueba. " : null}
        {record.threshold_source === "demo" ? "Umbrales de demostración sin calibrar. " : null}
        {result.transition ? (TRANSITION_COPY[result.transition.action === "publish" ? "publish" : result.transition.reason ?? ""] ?? "") : null}
      </Notice>
      <ul className="grid gap-1 t-ui">
        {record.gates.map((gate) => (
          <li key={gate.id} className="flex items-start gap-2">
            <Tag tone={gate.passed ? "accent" : "neutral"}>{gate.passed ? "Cumple" : "No cumple"}</Tag>
            <span className="min-w-0">{GATE_COPY[gate.id] ?? gate.id} <span className="t-meta break-words">({gate.detail})</span></span>
          </li>
        ))}
      </ul>
      <p className="t-meta">
        Catálogo: {record.catalog.decision}/{record.catalog.tier}
        {record.latency_ms !== null ? ` · evaluador: ${record.latency_ms} ms` : ""} · intentos: {record.attempts}
        {record.failure ? ` · ${record.failure}` : ""}
      </p>
      {result.packet ? (
        <details className="t-meta">
          <summary className="cursor-pointer font-semibold text-ink">Evidencia enviada al evaluador</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-control bg-canvas p-3 text-[12px] leading-5">{JSON.stringify(result.packet, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}

const BASE_LABELS: Record<string, string> = { brand: "Marca", model: "Modelo", category: "Categoría", instrument_type: "Tipo de instrumento" };

function fieldLabel(field: string) {
  if (BASE_LABELS[field]) return BASE_LABELS[field];
  const key = field.replace(/^attribute:/, "");
  for (const option of categoryOptions) {
    for (const type of getInstrumentTypeOptions(option.value)) {
      const filter = getInstrumentFilterGroup(type.value)?.filters.find((item) => item.key === key);
      if (filter) return filter.label;
    }
  }
  return key.replace(/_/g, " ");
}
