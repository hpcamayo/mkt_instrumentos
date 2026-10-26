"use client";

import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Radio, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { qrSvgPath } from "@/lib/labels/qr";
import {
  LABEL_FORMATS, labelFormat, labelPosition, labelsPerPage, layoutLabel, paginate,
  type LabelData, type LabelFormat, type LabelOptions,
} from "@/lib/labels/sheets";

// reach-10 "Etiquetas para la tienda": price labels with a Code 128 barcode of the SKU (read by Mostrador) and a QR to
// the listing, laid out on label paper in the browser. Printing shows only the sheets (see PRINT_ROOT below).

export type LabelItem = LabelData & { id: string; available: number };

const MAX_COPIES = 50;
const MAX_LABELS = 1000;

export function LabelSheetEditor({ items }: { items: LabelItem[] }) {
  const [formatKey, setFormatKey] = useState(LABEL_FORMATS[0].key);
  const [options, setOptions] = useState<LabelOptions>({ price: true, barcode: true, qr: true });
  const [copies, setCopies] = useState<"one" | "stock">("one");
  const [skip, setSkip] = useState("1");
  const format = labelFormat(formatKey);
  const perPage = labelsPerPage(format);
  const start = Math.min(Math.max(Number.parseInt(skip, 10) || 1, 1), perPage);

  const labels = useMemo(() => {
    const list: LabelItem[] = [];
    for (const item of items) {
      const count = copies === "stock" ? Math.min(Math.max(item.available, 0), MAX_COPIES) : 1;
      for (let i = 0; i < count && list.length < MAX_LABELS; i++) list.push(item);
    }
    return list;
  }, [items, copies]);
  const pages = useMemo(() => paginate(labels, format, perPage > 1 ? start - 1 : 0), [labels, format, perPage, start]);
  const skipped = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) if (options.barcode && layoutLabel(item, format, options).barcodeSkipped) names.add(item.sku);
    return [...names];
  }, [items, format, options]);
  const withoutUrl = options.qr ? items.filter((item) => !item.url).length : 0;
  const zeroStock = copies === "stock" ? items.filter((item) => item.available <= 0).length : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <style>{printStyles(format)}</style>
      <form className="grid gap-5 rounded-panel border border-subtle bg-white p-5" onSubmit={(event) => { event.preventDefault(); window.print(); }} data-print-hidden>
        <Field id="etiquetas-formato" label="Papel de etiquetas" hint="Revisa la medida en el paquete de tus etiquetas.">
          <Select value={formatKey} onChange={(event) => setFormatKey(event.target.value)}>
            {LABEL_FORMATS.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
          </Select>
        </Field>
        <fieldset className="grid min-w-0 gap-2">
          <legend className="mb-1 t-ui font-semibold text-ink">En cada etiqueta</legend>
          <Checkbox checked={options.price} onChange={(event) => setOptions({ ...options, price: event.target.checked })} label="Precio" />
          <Checkbox checked={options.barcode} onChange={(event) => setOptions({ ...options, barcode: event.target.checked })} label="Código de barras del SKU" description="Mostrador lo lee con la cámara o con un lector USB." />
          <Checkbox checked={options.qr} onChange={(event) => setOptions({ ...options, qr: event.target.checked })} label="QR a la publicación" description="Quien lo escanea ve fotos, detalles y puede guardarla." />
        </fieldset>
        <fieldset className="grid min-w-0 gap-2">
          <legend className="mb-1 t-ui font-semibold text-ink">Cuántas</legend>
          <Radio name="copias" checked={copies === "one"} onChange={() => setCopies("one")} label="Una por SKU" />
          <Radio name="copias" checked={copies === "stock"} onChange={() => setCopies("stock")} label="Una por unidad disponible" description={`Hasta ${MAX_COPIES} por SKU.`} />
        </fieldset>
        {perPage > 1 ? (
          <Field id="etiquetas-inicio" label="Empezar en la etiqueta" hint={`Para usar una hoja empezada: cuenta de izquierda a derecha, de 1 a ${perPage}.`}>
            <Input type="number" inputMode="numeric" min={1} max={perPage} value={skip} onChange={(event) => setSkip(event.target.value)} className="max-w-28" />
          </Field>
        ) : null}
        <p className="t-ui text-ink" aria-live="polite">
          {labels.length === 1 ? "1 etiqueta" : `${labels.length} etiquetas`} en {pages.length === 1 ? (perPage > 1 ? "1 hoja" : "1 etiqueta de rollo") : perPage > 1 ? `${pages.length} hojas` : `${pages.length} etiquetas de rollo`}.
        </p>
        {skipped.length ? (
          <Notice tone="warning" role="note">
            {skipped.length === 1 ? `El SKU ${skipped[0]} no cabe` : `${skipped.length} SKU no caben`} como código de barras en esta etiqueta (muy largos, o con tildes o ñ). Se imprimen como texto; Mostrador los encuentra si los escribes.
          </Notice>
        ) : null}
        {withoutUrl ? <p className="t-meta">{withoutUrl === 1 ? "1 SKU no tiene" : `${withoutUrl} SKU no tienen`} publicación visible: su etiqueta va sin QR.</p> : null}
        {zeroStock ? <p className="t-meta">{zeroStock === 1 ? "1 SKU no tiene" : `${zeroStock} SKU no tienen`} unidades disponibles: no se imprime su etiqueta.</p> : null}
        <Button type="submit" icon={<Printer aria-hidden />} disabled={!labels.length}>Imprimir</Button>
        <p className="t-meta">En el diálogo de impresión elige tamaño de papel {format.page.width === 210 ? "A4" : `${format.page.width} × ${format.page.height} mm`}, escala 100 % y márgenes en “Ninguno”.</p>
      </form>

      <section aria-label="Vista previa de las hojas" className="grid min-w-0 gap-4" id={PRINT_ROOT}>
        {pages.map((page, index) => (
          <LabelPage key={index} format={format} page={page} options={options} number={index + 1} total={pages.length} />
        ))}
      </section>
    </div>
  );
}

const PRINT_ROOT = "hoja-etiquetas";

// Printing shows only the pages, at their real size, one per sheet.
function printStyles(format: LabelFormat) {
  return `@page { size: ${format.page.width}mm ${format.page.height}mm; margin: 0; }
@media print {
  body * { visibility: hidden !important; }
  #${PRINT_ROOT}, #${PRINT_ROOT} * { visibility: visible !important; }
  #${PRINT_ROOT} { position: absolute; left: 0; top: 0; display: block !important; gap: 0 !important; }
  #${PRINT_ROOT} [data-page] { width: ${format.page.width}mm !important; height: ${format.page.height}mm !important; max-width: none !important; border: 0 !important; box-shadow: none !important; margin: 0 !important; break-after: page; }
  #${PRINT_ROOT} [data-page-caption] { display: none !important; }
}`;
}

function LabelPage({ format, page, options, number, total }: { format: LabelFormat; page: (LabelItem | null)[]; options: LabelOptions; number: number; total: number }) {
  const single = labelsPerPage(format) === 1;
  return (
    <figure className="grid gap-1">
      <svg
        data-page
        role="img"
        aria-label={`${single ? "Etiqueta" : "Hoja"} ${number} de ${total}`}
        viewBox={`0 0 ${format.page.width} ${format.page.height}`}
        className="w-full rounded-control border border-subtle bg-white shadow-sm"
        style={{ maxWidth: single ? "20rem" : "42rem" }}
        fontFamily="var(--font-archivo), Arial, Helvetica, sans-serif"
      >
        <rect width={format.page.width} height={format.page.height} fill="#fff" />
        {page.map((item, index) => {
          const { x, y } = labelPosition(format, index);
          return (
            <g key={index} transform={`translate(${x} ${y})`}>
              {/* The outline shows on screen only, to check the layout; printed labels have no border. */}
              <rect data-outline width={format.label.width} height={format.label.height} fill="none" stroke="#d6d9de" strokeWidth={0.2} strokeDasharray="1 1" className="print:hidden" />
              {item ? <Label item={item} format={format} options={options} /> : null}
            </g>
          );
        })}
      </svg>
      {total > 1 ? <figcaption data-page-caption className="t-meta">{single ? "Etiqueta" : "Hoja"} {number} de {total}</figcaption> : null}
    </figure>
  );
}

function Label({ item, format, options }: { item: LabelItem; format: LabelFormat; options: LabelOptions }) {
  const layout = layoutLabel(item, format, options);
  return (
    <g fill="#050608">
      <text fontWeight={700} fontSize={layout.name.size}>
        {layout.name.lines.map((line, index) => (
          <tspan key={index} x={layout.name.x} y={layout.name.y + index * layout.name.size * 1.15}>{line}</tspan>
        ))}
      </text>
      {layout.detail ? <text x={layout.detail.x} y={layout.detail.y} fontSize={layout.detail.size}>{layout.detail.text}</text> : null}
      {layout.price ? <text x={layout.price.x} y={layout.price.y} fontSize={layout.price.size} fontWeight={800}>{layout.price.text}</text> : null}
      {layout.qr ? <QrGlyph modules={layout.qr.modules} x={layout.qr.x} y={layout.qr.y} size={layout.qr.size} /> : null}
      {layout.barcode ? <BarcodeGlyph barcode={layout.barcode} /> : null}
    </g>
  );
}

// The quiet zone is part of the drawn square, so the code keeps its white border on any background.
export function QrGlyph({ modules, x, y, size, quiet = 2 }: { modules: boolean[][]; x: number; y: number; size: number; quiet?: number }) {
  const { path, size: units } = qrSvgPath(modules, quiet);
  return (
    <svg x={x} y={y} width={size} height={size} viewBox={`0 0 ${units} ${units}`} shapeRendering="crispEdges" aria-hidden>
      <rect width={units} height={units} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

function BarcodeGlyph({ barcode }: { barcode: NonNullable<ReturnType<typeof layoutLabel>["barcode"]> }) {
  const bars: { x: number; width: number }[] = [];
  let cursor = barcode.x;
  barcode.widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push({ x: cursor, width: width * barcode.module });
    cursor += width * barcode.module;
  });
  return (
    <g>
      <g fill="#000" shapeRendering="crispEdges">
        {bars.map((bar, index) => <rect key={index} x={bar.x} y={barcode.y} width={bar.width} height={barcode.height} />)}
      </g>
      <text x={barcode.text.x} y={barcode.text.y} fontSize={barcode.text.size} textAnchor="middle" letterSpacing={0.2}>{barcode.text.value}</text>
    </g>
  );
}

