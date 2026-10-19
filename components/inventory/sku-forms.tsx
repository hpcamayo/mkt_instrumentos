"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { PriceInput } from "@/components/ui/price-input";
import { Textarea } from "@/components/ui/textarea";
import { categoryOptions } from "@/lib/listings";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { inventoryAction, newRequestKey, parseWholeNumber } from "@/lib/inventory-client";
import { parseWholeSolPrice } from "@/lib/price";
import type { InventoryItem } from "@/lib/store-inventory";

// "Nuevo SKU" (design §13.1) and "Controlar stock" on an existing store publication (§6.1). Both call
// create_inventory_item, which writes the item and its opening balance (and, for an adoption, the link) in one
// transaction; the key is created when the sheet opens.
// Effortless Laria, inventory batch, stock-11: "Crear y agregar otro" keeps the sheet open for the next SKU,
// "Duplicar SKU" opens it filled from another SKU, and "Tiene variantes" creates one SKU per variant (gauges, colors,
// sizes) in one go. Each variant has its own key derived from the sheet's, so a retry never creates one twice.

type FieldErrors = Partial<Record<"merchant_sku" | "product_name" | "unit_price_pen" | "opening" | "low_stock_threshold", string>>;

const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function readSkuForm(form: FormData, { requireName }: { requireName: boolean }) {
  const errors: FieldErrors = {};
  const sku = String(form.get("merchant_sku") ?? "").trim();
  if (sku && !SKU.test(sku)) errors.merchant_sku = "Usa letras, números, punto, guion o guion bajo, sin espacios; hasta 64 caracteres.";
  const name = String(form.get("product_name") ?? "").trim();
  if (requireName && name.length < 2) errors.product_name = "Ingresa un nombre de al menos 2 caracteres.";
  const priceText = String(form.get("unit_price_pen") ?? "").trim();
  const price = priceText ? parseWholeSolPrice(priceText) : null;
  if (priceText && price === null) errors.unit_price_pen = "Ingresa soles enteros, sin decimales.";
  const opening = parseWholeNumber(form.get("opening"));
  if (opening === null || opening > 100000) errors.opening = "Ingresa las unidades que tienes hoy, de 0 a 100000.";
  const thresholdText = String(form.get("low_stock_threshold") ?? "").trim();
  const threshold = thresholdText ? parseWholeNumber(thresholdText) : null;
  if (thresholdText && (threshold === null || threshold > 100000)) errors.low_stock_threshold = "Ingresa un número entero de 0 a 100000.";
  const fields: Record<string, unknown> = {};
  if (sku) fields.merchant_sku = sku;
  if (name) fields.product_name = name;
  const variant = String(form.get("variant_label") ?? "").trim();
  if (variant) fields.variant_label = variant;
  if (price !== null) fields.unit_price_pen = price;
  if (threshold !== null) fields.low_stock_threshold = threshold;
  const external = String(form.get("external_reference") ?? "").trim();
  if (external) fields.external_reference = external;
  return { errors, fields, opening: opening ?? 0 };
}

function fieldError(code: string, detail: Record<string, unknown> | null): keyof FieldErrors | null {
  if (code === "INVENTORY_SKU_TAKEN" || code === "INVENTORY_SKU_INVALID") return "merchant_sku";
  if (code === "INVENTORY_PRICE_INVALID") return "unit_price_pen";
  if (code === "STOCK_QUANTITY_INVALID") return "opening";
  const field = detail?.field;
  return field === "product_name" || field === "low_stock_threshold" ? field : null;
}

function SheetFooter({ formId, busy, label, onClose }: { formId: string; busy: boolean; label: string; onClose: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…">{label}</Button>
    </div>
  );
}

// What "Duplicar SKU" carries over: everything but the SKU, the stock and the codes, which belong to one SKU only.
export type SkuDraft = {
  product_name: string;
  variant_label: string | null;
  unit_price_pen: number | null;
  low_stock_threshold: number | null;
  category: string | null;
};

// "10-46, 9-42" or one per line; duplicates and blanks dropped, at most 30.
export function parseVariants(text: string) {
  const seen = new Set<string>();
  const variants: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    variants.push(value);
  }
  return variants.slice(0, MAX_VARIANTS);
}

export const MAX_VARIANTS = 30;

// The SKU of a variant: the base SKU plus the variant's letters and digits ("CUE-D" + "10-46" = "CUE-D-10-46").
export function variantSku(base: string, variant: string) {
  const suffix = variant.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base}-${suffix}`.slice(0, 64);
}

export function NewSkuSheet({ onClose, initial = null }: { onClose: () => void; initial?: SkuDraft | null }) {
  const router = useRouter();
  const [requestKey, setRequestKey] = useState(() => newRequestKey("sku"));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [created, setCreated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [withVariants, setWithVariants] = useState(false);
  const [variantText, setVariantText] = useState("");
  const another = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = "nuevo-sku";
  const variants = withVariants ? parseVariants(variantText) : [];

  async function setCategory(itemId: string, version: number, category: string) {
    if (!category) return;
    await inventoryAction({ action: "category", item_id: itemId, category, expected_version: version });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { errors: found, fields, opening } = readSkuForm(form, { requireName: true });
    const category = String(form.get("category") ?? "");
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length) return;
    if (withVariants && !variants.length) return setFailure("Escribe al menos una variante, por ejemplo “10-46, 9-42”.");
    setBusy(true);

    if (withVariants) {
      const base = typeof fields.merchant_sku === "string" ? fields.merchant_sku : "";
      const done: string[] = [];
      for (const [index, variant] of variants.entries()) {
        const variantFields = { ...fields, variant_label: variant, ...(base ? { merchant_sku: variantSku(base, variant) } : {}) };
        if (!base) delete (variantFields as Record<string, unknown>).merchant_sku;
        const result = await inventoryAction<{ item: InventoryItem }>({ action: "create", key: `${requestKey}:${index}`, fields: variantFields, opening_quantity: opening });
        if (!result.ok) {
          setBusy(false);
          setCreated(done);
          setFailure(`No se pudo crear la variante “${variant}”: ${result.message}${done.length ? ` Ya se crearon ${done.length}; si vuelves a intentar, no se duplican.` : ""}`);
          return;
        }
        await setCategory(result.data.item.id, result.data.item.version, category);
        done.push(result.data.item.merchant_sku);
      }
      setBusy(false);
      router.push(`/mi-cuenta/tienda/inventario?q=${encodeURIComponent(String(fields.product_name ?? ""))}&orden=name`);
      return;
    }

    const result = await inventoryAction<{ item: InventoryItem }>({ action: "create", key: requestKey, fields, opening_quantity: opening });
    if (result.ok) await setCategory(result.data.item.id, result.data.item.version, category);
    setBusy(false);
    if (!result.ok) {
      const field = fieldError(result.code, result.detail);
      if (field) setErrors({ [field]: result.message });
      else setFailure(result.message);
      return;
    }
    if (another.current) {
      // "Crear y agregar otro": same sheet, fresh key and fields; the name and price stay as a starting point.
      setCreated((list) => [...list, result.data.item.merchant_sku]);
      setRequestKey(newRequestKey("sku"));
      const formElement = formRef.current;
      formElement?.querySelectorAll<HTMLInputElement>("input[name=merchant_sku], input[name=variant_label], input[name=external_reference]").forEach((input) => { input.value = ""; });
      const variantInput = formElement?.querySelector<HTMLInputElement>("input[name=variant_label]");
      variantInput?.focus();
      router.refresh();
      return;
    }
    router.push(`/mi-cuenta/tienda/inventario/${result.data.item.id}?creado=1`);
  }

  return (
    <Sheet
      title={initial ? "Duplicar SKU" : "Nuevo SKU"}
      closeLabel={created.length ? "Cerrar" : "Cerrar sin guardar"}
      onDismiss={onClose}
      layout="responsive"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>{created.length ? "Listo" : "Cancelar"}</Button>
          {!withVariants ? (
            <Button type="submit" form={formId} variant="secondary" disabled={busy} onClick={() => { another.current = true; }}>Crear y agregar otro</Button>
          ) : null}
          <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…" onClick={() => { another.current = false; }}>
            {withVariants && variants.length ? `Crear ${variants.length} SKU` : "Crear SKU"}
          </Button>
        </div>
      }
    >
      <form ref={formRef} id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        {created.length ? (
          <Notice tone="success" role="status">Creados: {created.join(", ")}. Sigue con el siguiente.</Notice>
        ) : null}
        <Field id={`${formId}-nombre`} label="Nombre" hint="Como lo reconoces en tu tienda. Ej.: Boss DS-1 Distortion." error={errors.product_name}>
          <Input name="product_name" maxLength={140} required autoComplete="off" defaultValue={initial?.product_name} />
        </Field>
        <Field id={`${formId}-sku`} label={withVariants ? "SKU base" : "SKU"} optional hint={withVariants ? "Cada variante lo lleva con su medida al final, como CUE-D-10-46. Si lo dejas vacío, Laria genera uno por variante." : "Tu código interno. Si lo dejas vacío, Laria genera uno como LAR-000001."} error={errors.merchant_sku}>
          <Input name="merchant_sku" maxLength={withVariants ? 40 : 64} autoComplete="off" autoCapitalize="characters" />
        </Field>
        <Checkbox label="Tiene variantes (calibres, colores, tallas)" description="Crea un SKU por variante con los mismos datos." checked={withVariants} onChange={(event) => setWithVariants(event.target.checked)} />
        {withVariants ? (
          <Field id={`${formId}-variantes`} label="Variantes" hint={`Una por línea o separadas por coma, hasta ${MAX_VARIANTS}. ${variants.length ? `Se crearán ${variants.length}: ${variants.join(", ")}.` : ""}`}>
            <Textarea value={variantText} onChange={(event) => setVariantText(event.target.value)} rows={3} placeholder="10-46, 9-42, 11-49" />
          </Field>
        ) : (
          <Field id={`${formId}-variante`} label="Variante" optional hint="Color, acabado o medida, si este SKU es una versión concreta.">
            <Input name="variant_label" maxLength={80} autoComplete="off" defaultValue={initial?.variant_label ?? undefined} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${formId}-stock`} label={withVariants ? "Stock inicial de cada variante" : "Stock inicial"} hint="Unidades que tienes hoy." error={errors.opening}>
            <Input name="opening" inputMode="numeric" pattern="[0-9]*" defaultValue="0" autoComplete="off" />
          </Field>
          <Field id={`${formId}-precio`} label="Precio en soles" optional error={errors.unit_price_pen}>
            <PriceInput name="unit_price_pen" defaultValue={initial?.unit_price_pen} />
          </Field>
          <Field id={`${formId}-umbral`} label="Avisar con stock bajo desde" optional hint="Vacío: el aviso de tu tienda, si lo configuraste." error={errors.low_stock_threshold}>
            <Input name="low_stock_threshold" inputMode="numeric" pattern="[0-9]*" autoComplete="off" defaultValue={initial?.low_stock_threshold ?? undefined} />
          </Field>
          {!withVariants ? (
            <Field id={`${formId}-externa`} label="Referencia externa" optional hint="Código de barras o de tu proveedor.">
              <Input name="external_reference" maxLength={120} autoComplete="off" />
            </Field>
          ) : null}
          <Field id={`${formId}-categoria`} label="Categoría" optional>
            <Select name="category" defaultValue={initial?.category ?? ""}>
              <option value="">Sin categoría</option>
              {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
        </div>
        {failure ? <Notice tone="danger" role="alert">{failure}</Notice> : null}
      </form>
    </Sheet>
  );
}

// Adopting an existing publication: SKU and today's stock. The item takes the publication's title and price.
export function ControlStockSheet({ listing, onClose, onDone }: { listing: { id: string; title: string }; onClose: () => void; onDone: (message: string) => void }) {
  const router = useRouter();
  const [requestKey] = useState(() => newRequestKey("adoptar"));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = `controlar-${listing.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { errors: found, fields, opening } = readSkuForm(new FormData(event.currentTarget), { requireName: false });
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length) return;
    setBusy(true);
    const result = await inventoryAction<{ item: InventoryItem }>({
      action: "create",
      key: requestKey,
      fields: { ...fields, product_name: listing.title.slice(0, 140), listing_id: listing.id },
      opening_quantity: opening,
    });
    setBusy(false);
    if (!result.ok) {
      const field = fieldError(result.code, result.detail);
      if (field) setErrors({ [field]: result.message });
      else setFailure(result.message);
      return;
    }
    onDone(`Ahora controlas el stock de esta publicación con el SKU ${result.data.item.merchant_sku}.`);
    router.refresh();
  }

  return (
    <Sheet title="Controlar stock" closeLabel="Cerrar sin guardar" onDismiss={onClose} layout="responsive" footer={<SheetFooter formId={formId} busy={busy} label="Controlar stock" onClose={onClose} />}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <p className="t-body text-ink-2">
          <strong className="text-ink">{listing.title}</strong> pasará a Inventario. Al llegar a 0 unidades se mostrará como Agotado en vez de marcarse vendida, y las ventas se registran desde Inventario.
        </p>
        <Field id={`${formId}-sku`} label="SKU" optional hint="Si lo dejas vacío, Laria genera uno como LAR-000001." error={errors.merchant_sku}>
          <Input name="merchant_sku" maxLength={64} autoComplete="off" autoCapitalize="characters" />
        </Field>
        <Field id={`${formId}-stock`} label="Unidades que tienes hoy" error={errors.opening}>
          <Input name="opening" inputMode="numeric" pattern="[0-9]*" autoComplete="off" />
        </Field>
        <Field id={`${formId}-umbral`} label="Avisar con stock bajo desde" optional error={errors.low_stock_threshold}>
          <Input name="low_stock_threshold" inputMode="numeric" pattern="[0-9]*" autoComplete="off" />
        </Field>
        {failure ? <Notice tone="danger" role="alert">{failure}</Notice> : null}
      </form>
    </Sheet>
  );
}
