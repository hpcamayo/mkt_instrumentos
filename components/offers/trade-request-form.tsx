"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { X } from "lucide-react";
import { prepareListingPhoto, PHOTO_ACCEPT } from "@/components/selling/prepare-photo";
import { uploadObject } from "@/components/selling/listing-uploads";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button, IconButton } from "@/components/ui/button";
import { Field, FileInput, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PriceInput } from "@/components/ui/price-input";
import { Textarea } from "@/components/ui/textarea";
import { conditionScale } from "@/lib/listing-condition";
import { categoryOptions } from "@/lib/listings";
import { peruRegions } from "@/lib/location";
import { parseWholeSolPrice } from "@/lib/price";
import {
  TRADE_CATEGORIES,
  TRADE_PHOTO_MAX,
  TRADE_PHOTO_MIN,
  gearTypeOptions,
  isTradeCategory,
  tradePhotoPath,
  type GearItem,
  type TradeKind,
} from "@/lib/selling-tools";

type Photo = { slot: number; preview: string; path: string | null; error: string | null };

// sell-02 "Véndelo a una tienda" and run-04 "Parte de pago": the person describes the gear with two to six photos.
// For a sale, verified stores of their region that buy that category see it for 24 hours and each may send one offer;
// for part payment, only the listing's store answers with an estimate. Nobody sees the person's name or WhatsApp
// until they choose an offer. Photos upload one by one into the person's own folder before the request is sent.
export function TradeRequestForm({
  kind,
  userId,
  gear,
  initialGearId,
  listing,
  defaults,
}: {
  kind: TradeKind;
  userId: string;
  gear: GearItem[];
  initialGearId?: string | null;
  listing?: { id: string; title: string; storeName: string } | null;
  defaults: { city: string; region: string };
}) {
  const router = useRouter();
  const { run, busy, error, setError } = useSellingRpc();
  // The request's id is made here so its photos can be uploaded under it first.
  const requestId = useMemo(() => crypto.randomUUID(), []);
  const choices = kind === "sell" ? gear.filter((item) => isTradeCategory(item.category)) : gear;
  const start = choices.find((item) => item.id === initialGearId) ?? null;
  const [gearId, setGearId] = useState(start?.id ?? "");
  const [category, setCategory] = useState(start?.category ?? "");
  const [instrumentType, setInstrumentType] = useState(start?.instrument_type ?? "");
  const [brand, setBrand] = useState(start?.brand ?? "");
  const [model, setModel] = useState(start?.model ?? "");
  const [condition, setCondition] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState(defaults.city);
  const [region, setRegion] = useState(defaults.region);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [stores, setStores] = useState<number | null>(null);
  const categories = kind === "sell" ? categoryOptions.filter((option) => (TRADE_CATEGORIES as readonly string[]).includes(option.value)) : categoryOptions;
  const uploading = photos.some((photo) => !photo.path && !photo.error);

  // The real number of stores that would see it, before the person writes anything (sell only).
  useEffect(() => {
    if (kind !== "sell" || !category || !region) return;
    let active = true;
    void run<number>("count_trade_stores", { p_category: category, p_region: region }, "", "count").then((count) => {
      if (active) setStores(typeof count === "number" ? count : null);
    });
    return () => { active = false; };
  }, [kind, category, region, run]);

  useEffect(() => () => photos.forEach((photo) => URL.revokeObjectURL(photo.preview)), [photos]);

  function pickGear(id: string) {
    setGearId(id);
    const item = choices.find((entry) => entry.id === id);
    if (!item) return;
    setCategory(item.category);
    setInstrumentType(item.instrument_type);
    setBrand(item.brand);
    setModel(item.model);
  }

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const used = new Set(photos.map((photo) => photo.slot));
    const free = Array.from({ length: TRADE_PHOTO_MAX }, (_, index) => index + 1).filter((slot) => !used.has(slot));
    const batch = files.slice(0, free.length).map((file, index) => ({ file, slot: free[index] }));
    if (files.length > free.length) setError(`Puedes subir hasta ${TRADE_PHOTO_MAX} fotos.`);
    setPhotos((current) => [...current, ...batch.map(({ file, slot }) => ({ slot, preview: URL.createObjectURL(file), path: null, error: null }))]);
    for (const { file, slot } of batch) {
      try {
        const prepared = await prepareListingPhoto(file);
        if (prepared.file.type !== "image/jpeg") throw new Error("Usa una foto JPG, PNG o WEBP.");
        const path = tradePhotoPath(userId, requestId, slot);
        await uploadObject("trade-photos", path, prepared.file);
        setPhotos((current) => current.map((photo) => (photo.slot === slot ? { ...photo, path } : photo)));
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "No se pudo subir la foto.";
        setPhotos((current) => current.map((photo) => (photo.slot === slot ? { ...photo, error: message } : photo)));
      }
    }
  }

  function removePhoto(slot: number) {
    setPhotos((current) => current.filter((photo) => photo.slot !== slot));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ready = photos.filter((photo) => photo.path);
    const found: Record<string, string> = {};
    if (!category) found.category = "Elige una categoría.";
    if (!brand.trim()) found.brand = "Escribe la marca.";
    if (!condition) found.condition = "Elige el estado.";
    if (description.trim().length < 10) found.description = "Cuenta en unas palabras cómo está (al menos 10 caracteres).";
    if (!region) found.region = "Elige tu región.";
    if (ready.length < TRADE_PHOTO_MIN) found.photos = `Sube al menos ${TRADE_PHOTO_MIN} fotos: de frente y un detalle.`;
    if (price && !parseWholeSolPrice(price)) found.price = "Escribe un monto en soles enteros.";
    setProblems(found);
    if (Object.keys(found).length) return;
    const result = await run<{ id: string }>("create_trade_request", {
      p_id: requestId,
      p_fields: {
        kind,
        gear_item_id: gearId || null,
        listing_id: listing?.id ?? null,
        category,
        instrument_type: instrumentType || "other",
        brand: brand.trim(),
        model: model.trim(),
        condition,
        description: description.trim(),
        asking_price_pen: price ? parseWholeSolPrice(price) : null,
        city: city.trim(),
        region,
        photos: ready.sort((a, b) => a.slot - b.slot).map((photo) => photo.path),
      },
    }, "No pudimos enviar el pedido. Inténtalo de nuevo.");
    if (result?.id) router.push(`/mi-cuenta/equipo/ofertas/${result.id}?enviado=1`);
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {choices.length ? (
        <Field id="pedido-equipo" label="De Mi equipo" optional hint="Elige uno para llenar marca y modelo.">
          <Select value={gearId} onChange={(event) => pickGear(event.target.value)}>
            <option value="">Lo describo yo</option>
            {choices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="pedido-categoria" label="Categoría" error={problems.category}>
          <Select value={category} onChange={(event) => { setCategory(event.target.value); setInstrumentType(""); }}>
            <option value="">Elige una categoría</option>
            {categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field id="pedido-tipo" label="Tipo" optional>
          <Select value={instrumentType} onChange={(event) => setInstrumentType(event.target.value)} disabled={!category}>
            <option value="">{category ? "Elige el tipo" : "Primero la categoría"}</option>
            {(category ? gearTypeOptions(category) : []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field id="pedido-marca" label="Marca" error={problems.brand}>
          <Input value={brand} maxLength={80} autoComplete="off" onChange={(event) => setBrand(event.target.value)} />
        </Field>
        <Field id="pedido-modelo" label="Modelo" optional>
          <Input value={model} maxLength={120} autoComplete="off" onChange={(event) => setModel(event.target.value)} />
        </Field>
        <Field id="pedido-estado" label="Estado" error={problems.condition} hint={conditionScale.find((step) => step.value === condition)?.definition}>
          <Select value={condition} onChange={(event) => setCondition(event.target.value)}>
            <option value="">Elige el estado</option>
            {conditionScale.filter((step) => !step.storeOnly).map((step) => <option key={step.value} value={step.value}>{step.value}</option>)}
          </Select>
        </Field>
        {kind === "sell" ? (
          <Field id="pedido-precio" label="¿Cuánto esperas recibir?" optional error={problems.price} hint="Las tiendas igual pueden ofrecer otro monto.">
            <PriceInput value={price} onValueChange={setPrice} />
          </Field>
        ) : null}
      </div>
      <Field id="pedido-descripcion" label="Cómo está" error={problems.description} hint="Uso, detalles, accesorios y si tiene caja o estuche. Sin teléfonos ni enlaces: el contacto se comparte cuando eliges una oferta.">
        <Textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="pedido-ciudad" label="Ciudad" optional>
          <Input value={city} maxLength={80} autoComplete="address-level2" onChange={(event) => setCity(event.target.value)} />
        </Field>
        <Field id="pedido-region" label="Región" error={problems.region}>
          <Select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="">Elige tu región</option>
            {peruRegions.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
      </div>

      <fieldset className="grid gap-3">
        <legend className="t-ui font-semibold text-ink">Fotos ({photos.filter((photo) => photo.path).length} de {TRADE_PHOTO_MAX})</legend>
        <p className="t-meta">De frente, de espaldas y un detalle de lo que más se usa. Solo las ven las tiendas que reciben el pedido.</p>
        {problems.photos ? <p className="t-ui font-semibold text-danger" role="alert">{problems.photos}</p> : null}
        {photos.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {photos.map((photo) => (
              <li key={photo.slot} className="relative overflow-hidden rounded-control border border-subtle bg-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
                <img src={photo.preview} alt={`Foto ${photo.slot}`} className="aspect-square w-full object-cover" />
                <p className="px-1.5 py-1 t-meta">{photo.error ? photo.error : photo.path ? "Lista" : "Subiendo…"}</p>
                <IconButton label={`Quitar foto ${photo.slot}`} icon={<X />} size="sm" className="absolute right-1 top-1 bg-surface" onClick={() => removePhoto(photo.slot)} />
              </li>
            ))}
          </ul>
        ) : null}
        {photos.length < TRADE_PHOTO_MAX ? (
          <Field id="pedido-fotos" label="Agregar fotos">
            <FileInput accept={PHOTO_ACCEPT} multiple onChange={addPhotos} />
          </Field>
        ) : null}
      </fieldset>

      {kind === "sell" && category && region ? (
        <Notice tone={stores === 0 ? "warning" : "info"} role="status">
          {stores === null
            ? "Buscando tiendas que compren esta categoría en tu región…"
            : stores === 0
            ? "Todavía no hay tiendas verificadas de tu región que compren esta categoría. Puedes publicarlo tú en Laria."
            : `${stores === 1 ? "Una tienda verificada de tu región lo verá" : `${stores} tiendas verificadas de tu región lo verán`} durante 24 horas. Luego tienes 3 días para elegir una oferta, o ninguna.`}
        </Notice>
      ) : null}
      {kind === "part_payment" && listing ? (
        <Notice tone="info" role="status">
          Solo {listing.storeName} verá este pedido y te responderá con un estimado. El valor final lo confirma la tienda al revisar el equipo.
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy === "create_trade_request"} loadingLabel="Enviando" disabled={uploading || (kind === "sell" && stores === 0)}>
          {kind === "sell" ? "Pedir ofertas" : "Pedir un estimado"}
        </Button>
        <Button href={kind === "sell" ? "/mi-cuenta/equipo" : listing ? `/instrumentos/${listing.id}` : "/mi-cuenta/equipo"} variant="quiet">Cancelar</Button>
      </div>
      <p className="t-meta">
        {kind === "sell"
          ? "Laria no compra ni paga: la tienda revisa el equipo, confirma el precio final y te paga directamente. No hay ningún cobro por usar esto."
          : "Laria no compra ni cobra: la tienda revisa el equipo, confirma su valor y lo descuenta de tu compra. No hay ningún cobro por usar esto."}
      </p>
    </form>
  );
}
