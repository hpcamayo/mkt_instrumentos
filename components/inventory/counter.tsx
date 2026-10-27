"use client";

import { Camera, CameraOff, Minus, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { undoMovements } from "@/components/inventory/stock-action-sheet";
import { UndoNotice, type InventoryNotice } from "@/components/inventory/undo-notice";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import {
  INDEX_KEY, QUEUE_KEY, addToCart, cartTotal, cartUnits, isConnectionFailure, matchCode, readJson, saleRequest, writeJson,
  type CartLine, type CounterItem, type QueuedSale,
} from "@/lib/inventory-counter";
import { EMPTY_RECEIPT, ReceiptFields, ReceiptOutcome, receiptRequest, receiptTotal, type ReceiptDraft } from "@/components/einvoice/counter-receipt";
import { issueReceipt } from "@/lib/einvoice/client";
import { receiptProblem, type ReceiptRecord } from "@/lib/einvoice/nubefact";
import { COUNTER_LOCATION_KEY } from "@/lib/store-locations";
import { inventoryAction, newRequestKey } from "@/lib/inventory-client";
import { CHANNEL_LABELS, SALE_CHANNELS, numbers } from "@/lib/store-inventory";

// Effortless Laria, inventory batch, big-10: Mostrador. A code comes from the camera (BarcodeDetector, where the
// browser has it), a USB scanner (it types the code and Enter) or the keyboard; each one adds a unit to the sale.
// "Registrar venta" records the whole sale as one all-or-nothing batch with its own key. Without a connection the
// sale waits on this device and is sent, with the same key, when the connection is back, so it is never recorded
// twice. Every recorded sale offers "Deshacer" for ten seconds.

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
const RETRY_MS = 30_000;

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// store-locations: `locations` (run-02) makes the sale come from the location chosen on this device, and `receipts`
// (run-03) offers the boleta or factura with the sale when the store connected its Nubefact account.
export type CounterLocation = { id: string; name: string; is_primary: boolean };

export function Counter({ storeId, locations = [], locationStock = {}, receipts = null }: {
  storeId: string;
  locations?: CounterLocation[];
  locationStock?: Record<string, Record<string, number>>;
  receipts?: { storeName: string } | null;
}) {
  const id = useId();
  const [items, setItems] = useState<CounterItem[]>([]);
  const [loaded, setLoaded] = useState<"loading" | "online" | "offline" | "failed">("loading");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [code, setCode] = useState("");
  const [options, setOptions] = useState<CounterItem[]>([]);
  const [hint, setHint] = useState("");
  const [channel, setChannel] = useState<string>("tienda_fisica");
  const [saleKey, setSaleKey] = useState(() => newRequestKey("mostrador"));
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  const [camera, setCamera] = useState(false);
  // store-locations (run-02, run-03)
  const [locationId, setLocationId] = useState(() => locations.find((location) => location.is_primary)?.id ?? locations[0]?.id ?? "");
  const [atLocation, setAtLocation] = useState(locationStock);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft>(EMPTY_RECEIPT);
  const [lastReceipt, setLastReceipt] = useState<ReceiptRecord | null>(null);
  const [receiptNote, setReceiptNote] = useState("");
  // The shared Input does not forward refs; the field's id finds it.
  const codeInput = { get current() { return typeof document === "undefined" ? null : document.getElementById(`${id}-entrada`) as HTMLInputElement | null; } };
  const changeNotice = useCallback((next: InventoryNotice) => setNotice(next), []);
  const supportsCamera = typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);

  const loadIndex = useCallback(async () => {
    const result = await inventoryAction<{ items: CounterItem[] }>({ action: "counter_index" });
    if (result.ok) {
      setItems(result.data.items);
      writeJson(storage(), INDEX_KEY(storeId), result.data.items);
      setLoaded("online");
      return;
    }
    const cached = readJson<CounterItem[]>(storage(), INDEX_KEY(storeId), []);
    setItems(cached);
    setLoaded(cached.length ? "offline" : "failed");
  }, [storeId]);

  const saveQueue = useCallback((next: QueuedSale[]) => {
    setQueue(next);
    writeJson(storage(), QUEUE_KEY(storeId), next);
  }, [storeId]);

  // Sends waiting sales in order, each with its own key. Stops at the first connection failure.
  const flush = useCallback(async () => {
    const waiting = readJson<QueuedSale[]>(storage(), QUEUE_KEY(storeId), []);
    let remaining = [...waiting];
    let sent = 0;
    for (const sale of waiting) {
      if (sale.error) continue;
      const result = await inventoryAction(saleRequest(sale));
      if (!result.ok && isConnectionFailure(result.code)) break;
      remaining = remaining.flatMap((entry) => (entry.key !== sale.key ? [entry] : result.ok ? [] : [{ ...entry, error: result.message }]));
      if (result.ok) sent += 1;
      // run-03: the comprobante that waited with the sale. A failure stays in Comprobantes, ready to retry.
      if (result.ok && sale.receipt) {
        const issued = await issueReceipt(sale.key, sale.receipt);
        if (issued.ok) setLastReceipt(issued.data.receipt);
        else setReceiptNote(`La venta que esperaba conexión se registró, pero su comprobante no: ${issued.message}`);
      }
    }
    saveQueue(remaining);
    if (sent) {
      setNotice({ kind: "success", message: `${sent === 1 ? "Se registró la venta" : `Se registraron ${sent} ventas`} que esperaban conexión.` });
      loadIndex();
    }
  }, [loadIndex, saveQueue, storeId]);

  useEffect(() => {
    const saved = readJson<string>(storage(), COUNTER_LOCATION_KEY(storeId), "");
    if (saved && locations.some((location) => location.id === saved)) setLocationId(saved);
    // Only on first load: the list of locations comes with the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    setQueue(readJson<QueuedSale[]>(storage(), QUEUE_KEY(storeId), []));
    loadIndex().then(() => flush());
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => { if (navigator.onLine) flush(); }, RETRY_MS);
    return () => { window.removeEventListener("online", onOnline); clearInterval(timer); };
  }, [flush, loadIndex, storeId]);

  // Units already promised by waiting sales are not available again.
  const pending = new Map<string, number>();
  for (const sale of queue) if (!sale.error) for (const line of sale.lines) pending.set(line.item_id, (pending.get(line.item_id) ?? 0) + line.quantity);
  // run-02: at a location, only its units count (minus what waiting sales there promised).
  const pendingHere = new Map<string, number>();
  for (const sale of queue) if (!sale.error && sale.location_id === locationId) for (const line of sale.lines) pendingHere.set(line.item_id, (pendingHere.get(line.item_id) ?? 0) + line.quantity);
  const effective = (item: CounterItem): CounterItem => {
    const total = Math.max(0, item.quantity_available - (pending.get(item.id) ?? 0));
    if (!locationId) return { ...item, quantity_available: total };
    const here = Math.max(0, (atLocation[locationId]?.[item.id] ?? 0) - (pendingHere.get(item.id) ?? 0));
    return { ...item, quantity_available: Math.min(total, here) };
  };
  const locationName = locations.find((location) => location.id === locationId)?.name ?? null;

  function chooseLocation(next: string) {
    setLocationId(next);
    setCart([]);
    writeJson(storage(), COUNTER_LOCATION_KEY(storeId), next);
  }

  function add(item: CounterItem, by = 1) {
    const result = addToCart(cart, effective(item), by);
    setCart(result.cart);
    setOptions([]);
    setHint(result.limited
      ? effective(item).quantity_available === 0 ? `${item.merchant_sku} no tiene unidades disponibles${locationName ? ` en ${locationName}` : ""}. Si el stock real es distinto, registra un conteo en Inventario.` : `Solo hay ${numbers.format(effective(item).quantity_available)} disponibles de ${item.merchant_sku}${locationName ? ` en ${locationName}` : ""}.`
      : by > 0 ? `${item.merchant_sku}: ${item.product_name}` : "");
  }

  function onCode(value: string) {
    const match = matchCode(items, value);
    if (match.exact) {
      add(match.exact);
      setCode("");
      return true;
    }
    setOptions(match.options);
    setHint(match.options.length ? "Elige el SKU." : `No encontramos “${value.trim()}” en tu inventario.`);
    return false;
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    if (code.trim()) onCode(code);
    codeInput.current?.focus();
  }

  async function record() {
    if (!cart.length) return;
    const receipt = receipts ? receiptRequest(receiptDraft, cart) : null;
    const problem = receipt ? receiptProblem(receipt, receiptTotal(receiptDraft, cart)) : null;
    if (problem) {
      setNotice({ kind: "error", message: `Comprobante: ${problem}` });
      return;
    }
    const sale: QueuedSale = {
      key: saleKey,
      channel,
      lines: cart.map((line) => ({ item_id: line.item.id, merchant_sku: line.item.merchant_sku, quantity: line.quantity })),
      created_at: new Date().toISOString(),
      ...(locationId ? { location_id: locationId } : {}),
      ...(receipt ? { receipt } : {}),
    };
    setBusy(true);
    setLastReceipt(null);
    setReceiptNote("");
    const result = await inventoryAction<{ movements: { id: string }[]; items: { id: string; quantity_available: number }[] }>(saleRequest(sale));
    setBusy(false);
    const units = cartUnits(cart);
    if (!result.ok && isConnectionFailure(result.code)) {
      saveQueue([...queue, sale]);
      setCart([]);
      setReceiptDraft(EMPTY_RECEIPT);
      setSaleKey(newRequestKey("mostrador"));
      setNotice({ kind: "success", message: `Sin conexión: la venta de ${numbers.format(units)} ${units === 1 ? "unidad" : "unidades"} quedó guardada en este equipo y se registrará sola al volver la conexión.` });
      codeInput.current?.focus();
      return;
    }
    if (!result.ok) {
      setNotice({ kind: "error", message: result.message });
      return;
    }
    const available = new Map(result.data.items.map((item) => [item.id, item.quantity_available]));
    setItems((current) => current.map((item) => (available.has(item.id) ? { ...item, quantity_available: available.get(item.id)!, version: item.version + 1 } : item)));
    if (locationId) {
      setAtLocation((current) => {
        const here = { ...(current[locationId] ?? {}) };
        for (const line of sale.lines) here[line.item_id] = Math.max(0, (here[line.item_id] ?? 0) - line.quantity);
        return { ...current, [locationId]: here };
      });
    }
    setCart([]);
    setReceiptDraft(EMPTY_RECEIPT);
    setSaleKey(newRequestKey("mostrador"));
    setNotice({
      kind: "success",
      message: `Venta registrada: ${numbers.format(units)} ${units === 1 ? "unidad" : "unidades"} (${CHANNEL_LABELS[channel]}${locationName ? `, ${locationName}` : ""}).`,
      undo: undoMovements(result.data.movements.map((movement) => movement.id), receipt
        ? "Venta deshecha. El stock volvió a como estaba. Si ya se emitió el comprobante, anúlalo en Comprobantes."
        : "Venta deshecha. El stock volvió a como estaba."),
    });
    codeInput.current?.focus();
    if (receipt) {
      const issued = await issueReceipt(sale.key, receipt);
      if (issued.ok) setLastReceipt(issued.data.receipt);
      else setReceiptNote(`La venta se registró, pero el comprobante no: ${issued.message}`);
    }
  }

  const total = cartTotal(cart);
  const units = cartUnits(cart);
  const waiting = queue.filter((sale) => !sale.error);
  const refused = queue.filter((sale) => sale.error);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <section aria-labelledby={`${id}-codigo`} className="grid gap-4 rounded-panel border border-subtle bg-white p-4 md:p-5">
        <h2 id={`${id}-codigo`} className="t-section text-ink">Agregar a la venta</h2>
        {locations.length ? (
          <Field id={`${id}-sede`} label="Sede" hint="Las unidades se descuentan de esta sede. Este equipo la recuerda.">
            <Select value={locationId} onChange={(event) => chooseLocation(event.target.value)}>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </Select>
          </Field>
        ) : null}
        {loaded === "offline" ? <Notice tone="warning" role="status">Sin conexión. Usamos la lista de SKU guardada en este equipo; las ventas se registrarán al volver la conexión.</Notice> : null}
        {loaded === "failed" ? <Notice tone="danger" role="alert">No pudimos cargar tus SKU. Revisa tu conexión y vuelve a abrir el Mostrador.</Notice> : null}
        <form onSubmit={submitCode} className="flex items-end gap-2">
          <Field id={`${id}-entrada`} label="Código, SKU o nombre" hint="Con un lector USB, escanea aquí: cada código suma una unidad." className="min-w-0 flex-1">
            <Input
              value={code}
              onChange={(event) => { setCode(event.target.value); setOptions([]); }}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="go"
              disabled={loaded === "loading"}
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={!code.trim()}>Agregar</Button>
        </form>
        {supportsCamera ? (
          <div className="grid gap-3">
            <Button variant="secondary" icon={camera ? <CameraOff aria-hidden /> : <Camera aria-hidden />} onClick={() => setCamera((value) => !value)} aria-pressed={camera}>
              {camera ? "Apagar la cámara" : "Escanear con la cámara"}
            </Button>
            {camera ? <CameraScanner onCode={(value) => onCode(value)} onError={(message) => { setCamera(false); setHint(message); }} /> : null}
          </div>
        ) : (
          <p className="t-meta">Este navegador no lee códigos con la cámara. Escribe el código o usa un lector USB; también puedes probar con Chrome en Android.</p>
        )}
        {hint ? <p className="t-ui text-ink" role="status">{hint}</p> : null}
        {options.length ? (
          <ul className="divide-y divide-subtle rounded-control border border-subtle" aria-label="SKU que coinciden">
            {options.map((item) => (
              <li key={item.id}>
                <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left t-ui hover:bg-surface" onClick={() => { add(item); setCode(""); codeInput.current?.focus(); }}>
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{item.product_name}{item.variant_label ? ` · ${item.variant_label}` : ""}</span>
                    <span className="block t-meta">SKU {item.merchant_sku} · Disponible {numbers.format(effective(item).quantity_available)}</span>
                  </span>
                  <span className="shrink-0 font-semibold">Agregar</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-venta`} className="grid gap-4 rounded-panel border border-subtle bg-white p-4 md:p-5 lg:sticky lg:top-4">
        <h2 id={`${id}-venta`} className="t-section text-ink">Venta</h2>
        {notice ? <UndoNotice notice={notice} onChange={changeNotice} /> : null}
        {cart.length ? (
          <ul className="divide-y divide-subtle rounded-control border border-subtle">
            {cart.map((line) => (
              <li key={line.item.id} className="grid gap-2 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 t-ui">
                    <span className="block font-semibold text-ink">{line.item.product_name}{line.item.variant_label ? ` · ${line.item.variant_label}` : ""}</span>
                    <span className="block t-meta">SKU {line.item.merchant_sku} · Disponible {numbers.format(effective(line.item).quantity_available)}</span>
                  </span>
                  <Price value={line.item.unit_price_pen === null ? null : line.item.unit_price_pen * line.quantity} size="inline" />
                </div>
                <div className="flex items-center gap-2" role="group" aria-label={`Cantidad de ${line.item.merchant_sku}`}>
                  <Button variant="secondary" size="md" icon={<Minus aria-hidden />} aria-label={`Quitar una unidad de ${line.item.merchant_sku}`} onClick={() => add(line.item, -1)}>
                    <span className="sr-only">Menos</span>
                  </Button>
                  <span className="min-w-8 text-center t-ui font-semibold tabular-nums" aria-live="polite">{numbers.format(line.quantity)}</span>
                  <Button variant="secondary" size="md" icon={<Plus aria-hidden />} aria-label={`Agregar una unidad de ${line.item.merchant_sku}`} disabled={line.quantity >= effective(line.item).quantity_available} onClick={() => add(line.item, 1)}>
                    <span className="sr-only">Más</span>
                  </Button>
                  <Button variant="quiet" size="sm" icon={<Trash2 aria-hidden />} className="ml-auto" onClick={() => setCart(cart.filter((entry) => entry.item.id !== line.item.id))}>Quitar</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-body text-ink-2">Escanea o escribe un código para empezar.</p>
        )}
        <Field id={`${id}-canal`} label="¿Dónde se vendió?">
          <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
            {SALE_CHANNELS.map((value) => <option key={value} value={value}>{CHANNEL_LABELS[value]}</option>)}
          </Select>
        </Field>
        {total !== null && cart.length ? <p className="t-ui text-ink">Total de referencia: <Price value={total} size="inline" /></p> : null}
        {receipts && cart.length ? <ReceiptFields draft={receiptDraft} onChange={setReceiptDraft} cart={cart} /> : null}
        <Button block loading={busy} loadingLabel="Registrando…" disabled={!cart.length} onClick={record}>
          {cart.length ? `Registrar venta${receiptDraft.kind !== "none" && receipts ? ` y emitir ${receiptDraft.kind}` : ""} (${numbers.format(units)} ${units === 1 ? "unidad" : "unidades"})` : "Registrar venta"}
        </Button>
        {receiptNote ? <Notice tone="warning" role="alert">{receiptNote}</Notice> : null}
        {lastReceipt && receipts ? <ReceiptOutcome receipt={lastReceipt} storeName={receipts.storeName} onChange={setLastReceipt} /> : null}
        <p className="t-meta">Es una anotación de tu tienda: descuenta stock, pero no crea una venta verificada en Laria ni cobra nada.</p>
        {waiting.length ? (
          <Notice tone="warning" role="status">
            {waiting.length === 1 ? "1 venta espera conexión" : `${waiting.length} ventas esperan conexión`} en este equipo. Se registrarán solas; no cierres sesión en este equipo hasta entonces.{" "}
            <button type="button" className="link font-semibold" onClick={() => flush()}>Intentar ahora</button>
          </Notice>
        ) : null}
        {refused.map((sale) => (
          <Notice key={sale.key} tone="danger" role="alert">
            No se pudo registrar una venta guardada sin conexión ({sale.lines.map((line) => `${line.merchant_sku} × ${line.quantity}`).join(", ")}): {sale.error}{" "}
            <button type="button" className="link font-semibold" onClick={() => saveQueue(queue.filter((entry) => entry.key !== sale.key))}>Descartar</button>
          </Notice>
        ))}
      </section>
    </div>
  );
}

// The camera preview with the browser's own barcode reader. The same code is ignored for 1.5 s so one scan is one
// unit; the owner taps + for more.
function CameraScanner({ onCode, onError }: { onCode: (code: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const handlers = useRef({ onCode, onError });
  handlers.current = { onCode, onError };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const Constructor = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!Constructor) return;
    const detector = new Constructor({ formats: FORMATS });

    async function tick() {
      if (stopped || !video.current) return;
      try {
        if (video.current.readyState >= 2) {
          const codes = await detector.detect(video.current);
          const value = codes[0]?.rawValue?.trim();
          const now = Date.now();
          if (value && !(last.current?.code === value && now - last.current.at < 1500)) {
            last.current = { code: value, at: now };
            handlers.current.onCode(value);
          }
        }
      } catch {
        // A frame the reader could not process; try the next one.
      }
      timer = setTimeout(tick, 250);
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (stopped) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        if (video.current) {
          video.current.srcObject = media;
          video.current.play().catch(() => undefined);
        }
        tick();
      })
      .catch(() => handlers.current.onError("No pudimos usar la cámara. Revisa el permiso del navegador o escribe el código."));

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <video ref={video} muted playsInline aria-label="Vista de la cámara para escanear códigos" className="aspect-video w-full rounded-control bg-ink object-cover" />
  );
}
