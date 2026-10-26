import { code128Widths, canEncodeCode128 } from "@/lib/labels/code128";
import { qrModules } from "@/lib/labels/qr";

// reach-10: price labels on standard label paper, laid out in millimetres and drawn as one SVG per page, so the screen
// preview and the print match. Formats are the common A4 label sheets sold in Peru plus a 50 × 30 mm thermal roll.

export type LabelFormat = {
  key: string;
  name: string;
  page: { width: number; height: number };
  columns: number;
  rows: number;
  label: { width: number; height: number };
  // Page margins and gaps between labels, as printed on the sheet's packaging.
  margin: { top: number; left: number };
  gap: { x: number; y: number };
};

export const LABEL_FORMATS: LabelFormat[] = [
  {
    key: "a4-24",
    name: "A4 · 24 etiquetas de 70 × 37 mm",
    page: { width: 210, height: 297 },
    columns: 3, rows: 8, label: { width: 70, height: 37 },
    margin: { top: 0.5, left: 0 }, gap: { x: 0, y: 0 },
  },
  {
    key: "a4-14",
    name: "A4 · 14 etiquetas de 99 × 38 mm",
    page: { width: 210, height: 297 },
    columns: 2, rows: 7, label: { width: 99.1, height: 38.1 },
    margin: { top: 15.15, left: 4.65 }, gap: { x: 2.5, y: 0 },
  },
  {
    key: "a4-40",
    name: "A4 · 40 etiquetas de 52 × 30 mm",
    page: { width: 210, height: 297 },
    columns: 4, rows: 10, label: { width: 52.5, height: 29.7 },
    margin: { top: 0, left: 0 }, gap: { x: 0, y: 0 },
  },
  {
    key: "rollo-50x30",
    name: "Rollo térmico de 50 × 30 mm",
    page: { width: 50, height: 30 },
    columns: 1, rows: 1, label: { width: 50, height: 30 },
    margin: { top: 0, left: 0 }, gap: { x: 0, y: 0 },
  },
];

export function labelFormat(key: string | null | undefined) {
  return LABEL_FORMATS.find((format) => format.key === key) ?? LABEL_FORMATS[0];
}

export function labelsPerPage(format: LabelFormat) {
  return format.columns * format.rows;
}

export type LabelData = {
  name: string;
  detail: string | null;
  price: string | null;
  sku: string;
  url: string | null;
};

export type LabelOptions = { price: boolean; barcode: boolean; qr: boolean };

// Places the labels on pages, leaving the first `skip` positions of the first sheet empty (a sheet already in use).
export function paginate<T>(labels: T[], format: LabelFormat, skip = 0) {
  const perPage = labelsPerPage(format);
  const start = Math.max(0, Math.min(skip, perPage - 1));
  const slots: (T | null)[] = [...new Array<null>(start).fill(null), ...labels];
  const pages: (T | null)[][] = [];
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
  return pages;
}

export function labelPosition(format: LabelFormat, index: number) {
  const column = index % format.columns;
  const row = Math.floor(index / format.columns);
  return {
    x: format.margin.left + column * (format.label.width + format.gap.x),
    y: format.margin.top + row * (format.label.height + format.gap.y),
  };
}

// Word wrap by an average glyph width (about 0.55 em for the UI font), up to `lines` lines with an ellipsis.
export function wrapText(text: string, width: number, fontSize: number, lines: number, glyph = 0.55) {
  const perLine = Math.max(4, Math.floor(width / (fontSize * glyph)));
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const result: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i].length > perLine ? `${words[i].slice(0, perLine - 1)}…` : words[i];
    const next = current ? `${current} ${word}` : word;
    if (next.length <= perLine) {
      current = next;
      continue;
    }
    result.push(current);
    current = word;
    if (result.length === lines) {
      current = "";
      const last = result[lines - 1];
      result[lines - 1] = `${last.slice(0, Math.max(1, perLine - 1)).replace(/\s+$/, "")}…`;
      return result;
    }
  }
  if (current) result.push(current);
  return result.slice(0, lines);
}

const PADDING = 2;
// The narrowest bar a phone camera or a basic scanner still reads reliably on paper.
const MIN_MODULE_MM = 0.19;
const MAX_MODULE_MM = 0.4;

export type LabelLayout = {
  name: { lines: string[]; x: number; y: number; size: number };
  detail: { text: string; x: number; y: number; size: number } | null;
  price: { text: string; x: number; y: number; size: number } | null;
  qr: { x: number; y: number; size: number; modules: boolean[][] } | null;
  barcode: { x: number; y: number; height: number; module: number; widths: number[]; text: { value: string; x: number; y: number; size: number } } | null;
  // True when the barcode was asked for but the SKU is too long or has characters Code 128 cannot hold.
  barcodeSkipped: boolean;
};

// Where everything goes on one label, in millimetres from its top-left corner.
export function layoutLabel(data: LabelData, format: LabelFormat, options: LabelOptions): LabelLayout {
  const { width, height } = format.label;
  const small = height < 32;
  const inner = { width: width - PADDING * 2, height: height - PADDING * 2 };

  let barcode: LabelLayout["barcode"] = null;
  let barcodeSkipped = false;
  const barcodeHeight = small ? 6 : 7.5;
  const barcodeText = small ? 2 : 2.3;
  if (options.barcode) {
    if (canEncodeCode128(data.sku)) {
      const widths = code128Widths(data.sku);
      const modules = widths.reduce((sum, value) => sum + value, 0) + 20;
      const module = Math.min(MAX_MODULE_MM, inner.width / modules);
      if (module >= MIN_MODULE_MM) {
        const total = modules * module;
        const x = PADDING + (inner.width - total) / 2 + 10 * module;
        const y = height - PADDING - barcodeText - 0.6 - barcodeHeight;
        barcode = {
          x, y, height: barcodeHeight, module, widths,
          text: { value: data.sku, x: width / 2, y: height - PADDING, size: barcodeText },
        };
      } else {
        barcodeSkipped = true;
      }
    } else {
      barcodeSkipped = true;
    }
  }
  const bottom = barcode ? barcode.y - 1 : height - PADDING;
  const topHeight = bottom - PADDING;

  let qr: LabelLayout["qr"] = null;
  if (options.qr && data.url) {
    const size = Math.min(topHeight, inner.width * 0.42);
    qr = { x: width - PADDING - size, y: PADDING, size, modules: qrModules(data.url) };
  }
  const textWidth = (qr ? qr.x - 1.5 : width - PADDING) - PADDING;

  const nameSize = small ? 2.5 : 3;
  const nameLines = wrapText(data.name, textWidth, nameSize, small ? 2 : 3, 0.58);
  let cursor = PADDING + nameSize;
  const name = { lines: nameLines, x: PADDING, y: cursor, size: nameSize };
  cursor += (nameLines.length - 1) * nameSize * 1.15;

  // Without a barcode, the SKU goes on the detail line.
  const detailSize = small ? 2 : 2.3;
  const detailText = [data.detail, barcode ? null : data.sku].filter(Boolean).join(" · ");
  let detail: LabelLayout["detail"] = null;
  if (detailText) {
    cursor += detailSize * 1.35;
    detail = { text: wrapText(detailText, textWidth, detailSize, 1)[0] ?? "", x: PADDING, y: cursor, size: detailSize };
  }

  let price: LabelLayout["price"] = null;
  if (options.price && data.price) {
    const size = small ? 4.2 : 5.5;
    price = { text: data.price, x: PADDING, y: Math.max(cursor + size * 1.15, bottom - 0.5), size };
    if (price.y > bottom) price.y = bottom;
  }

  return {
    name,
    detail,
    price,
    qr,
    barcode,
    barcodeSkipped,
  };
}
