// Feature ideas, store-locations batch, run-02 "Sedes" (docs/feature-ideas/store-locations.md). Shapes, copy and
// the pure parts (the availability line, the pickup sentence, the per-location stock sheet), unit-tested in
// tests/store-locations.test.cjs. The database functions in 20261209120000_feat_store_locations.sql are the writers.

export type StoreLocation = {
  id: string;
  name: string;
  region: string;
  city: string;
  district: string | null;
  address: string | null;
  show_address: boolean;
  opening_hours: string | null;
  pickup_enabled: boolean;
  is_primary: boolean;
  position: number;
  units: number;
  skus: number;
};

export type PublicLocation = {
  id: string;
  name: string;
  district: string | null;
  city: string | null;
  public_address: string | null;
  opening_hours: string | null;
  pickup_enabled: boolean;
};

export type LocationStock = { location_id: string; item_id: string; quantity_on_hand: number };

export const LOCATION_LIMIT = 20;

// "Disponible en Miraflores", "Disponible en Miraflores y Centro", "Disponible en Miraflores, San Isidro y Centro".
export function availabilityLine(names: string[]) {
  const list = names.filter(Boolean);
  if (!list.length) return null;
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}`;
  return `Disponible en ${joined}`;
}

export function locationPlace(location: Pick<PublicLocation, "district" | "city">) {
  return [location.district, location.city].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(", ");
}

// The sentence added to the WhatsApp message when the buyer picks where to collect (through the listing's
// quick-question store, so it travels with the chosen questions).
export function pickupSentence(name: string) {
  return `Quiero recogerlo en la sede ${name}.`;
}

// Inventario: "Miraflores 3 · Centro 1" under a SKU's quantity, main location first, empty locations left out.
export function locationBreakdown(locations: Pick<StoreLocation, "id" | "name">[], stock: LocationStock[], itemId: string) {
  const byLocation = new Map(stock.filter((row) => row.item_id === itemId).map((row) => [row.location_id, row.quantity_on_hand]));
  return locations
    .map((location) => ({ name: location.name, quantity: byLocation.get(location.id) ?? 0 }))
    .filter((entry) => entry.quantity > 0);
}

export function breakdownText(entries: { name: string; quantity: number }[]) {
  return entries.map((entry) => `${entry.name} ${new Intl.NumberFormat("es-PE").format(entry.quantity)}`).join(" · ");
}

// ------------------------------------------------------------------ the "Stock por sede" sheet

export const STOCK_SHEET_SKU = "SKU";
export const stockColumn = (name: string) => `Stock ${name}`;

// Reads the sheet back: a SKU column and one "Stock <sede>" column per location to count. Blank cells are skipped (not
// counted); anything else must be a whole number from 0 to 100000.
export type SheetCount = { location_id: string; sku: string; quantity: number };
export type SheetProblem = { row: number; message: string };

export function readStockSheet(
  rows: string[][],
  locations: Pick<StoreLocation, "id" | "name">[],
): { counts: SheetCount[]; problems: SheetProblem[]; columns: string[] } {
  const problems: SheetProblem[] = [];
  const counts: SheetCount[] = [];
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.trim().toUpperCase() === STOCK_SHEET_SKU));
  if (headerIndex < 0) return { counts, problems: [{ row: 1, message: "Falta la columna SKU." }], columns: [] };
  const header = rows[headerIndex].map((cell) => cell.trim());
  const skuColumn = header.findIndex((cell) => cell.toUpperCase() === STOCK_SHEET_SKU);
  const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const columns = locations
    .map((location) => ({ location, index: header.findIndex((cell) => fold(cell) === fold(stockColumn(location.name))) }))
    .filter((entry) => entry.index >= 0);
  if (!columns.length) {
    return { counts, problems: [{ row: headerIndex + 1, message: "No hay columnas “Stock <sede>” con el nombre de una de tus sedes." }], columns: [] };
  }
  const seen = new Set<string>();
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const line = headerIndex + offset + 2;
    const sku = (row[skuColumn] ?? "").trim();
    if (!sku && row.every((cell) => !cell.trim())) return;
    if (!sku) {
      problems.push({ row: line, message: "Fila sin SKU." });
      return;
    }
    if (seen.has(sku.toUpperCase())) {
      problems.push({ row: line, message: `El SKU ${sku} aparece dos veces.` });
      return;
    }
    seen.add(sku.toUpperCase());
    for (const { location, index } of columns) {
      const raw = (row[index] ?? "").trim().replace(/\s+/g, "");
      if (!raw) continue;
      if (!/^\d{1,6}$/.test(raw) || Number(raw) > 100000) {
        problems.push({ row: line, message: `${stockColumn(location.name)} de ${sku} debe ser un número entero de 0 a 100000.` });
        continue;
      }
      counts.push({ location_id: location.id, sku, quantity: Number(raw) });
    }
  });
  return { counts, problems, columns: columns.map((entry) => stockColumn(entry.location.name)) };
}

// Groups counts per location into requests of at most 200 SKU (set_location_stock_counts' limit).
export function countBatches(counts: { location_id: string; item_id: string; quantity: number }[], size = 200) {
  const byLocation = new Map<string, { item_id: string; quantity: number }[]>();
  for (const count of counts) {
    const list = byLocation.get(count.location_id) ?? [];
    list.push({ item_id: count.item_id, quantity: count.quantity });
    byLocation.set(count.location_id, list);
  }
  const batches: { location_id: string; counts: { item_id: string; quantity: number }[] }[] = [];
  for (const [locationId, list] of byLocation) {
    for (let start = 0; start < list.length; start += size) batches.push({ location_id: locationId, counts: list.slice(start, start + size) });
  }
  return batches;
}

// Mostrador remembers the location chosen on each device.
export const COUNTER_LOCATION_KEY = (storeId: string) => `laria:mostrador:sede:${storeId}`;
