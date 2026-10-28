import { categoryOptions } from "@/lib/listings";
import {
  DEFAULT_FILTERS,
  INVENTORY_NO_CATEGORY,
  PRICE_FILTERS,
  PUBLICATION_FILTERS,
  SORTS,
  STOCK_FILTERS,
  inventoryHref,
  type InventoryFilters,
} from "@/lib/store-inventory";

// stock-24 (docs/ux-effortless/maybes-ai.md), "Pregúntale a tu tienda": a store owner's question in plain words becomes
// the existing filters of Inventario, a view of Estadísticas or the Reposición list. The model sees the question and
// this vocabulary, never the store's data; its answer is only values from these lists (and a search text), checked
// again here against the site's own lists before any link is built. Pure, so the route, the pages and the tests share it.

export const STORE_QUESTION_MAX = 200;

// The pages read these from the link the answer builds: the "Así lo entendí" panel shows while asi=1 is there, and
// falta lists what the question asked that no filter covers. The question itself never goes in a link.
export const UNDERSTOOD_PARAM = "asi";
export const GAPS_PARAM = "falta";
export const FOCUS_PARAM = "enfoque";

export const STORE_GAPS = ["quantity", "sales", "dates", "price_range", "other"] as const;
export type StoreGap = (typeof STORE_GAPS)[number];

export const STORE_GAP_TEXT: Record<StoreGap, string> = {
  quantity: "No hay un filtro por número de unidades.",
  sales: "Laria aún no ordena los SKU por unidades vendidas.",
  dates: "Las estadísticas solo tienen 7 días, 30 días o todo el historial.",
  price_range: "No hay un filtro por rango de precio.",
  other: "Una parte de tu pregunta no tiene un filtro en Laria.",
};

export const STATISTICS_PERIODS = ["7", "30", "all"] as const;
export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[number];

// The sections of /mi-cuenta/tienda/estadisticas a question can point at.
export const STATISTICS_FOCUS = [
  { value: "views", label: "Lo más visto", anchor: "ranking-publicaciones" },
  { value: "contacts", label: "Lo más consultado", anchor: "ranking-publicaciones" },
  { value: "unsold_contacts", label: "Contactos sin venta", anchor: "contactos-sin-venta" },
  { value: "totals", label: "Totales de la tienda", anchor: "metricas-tienda" },
] as const;
export type StatisticsFocus = "" | (typeof STATISTICS_FOCUS)[number]["value"];

export const STORE_DESTINATIONS = ["inventory", "statistics", "reorder", "none"] as const;
export type StoreDestination = (typeof STORE_DESTINATIONS)[number];

export type StoreAnswer = {
  destination: StoreDestination;
  filters: InventoryFilters;
  period: StatisticsPeriod;
  focus: StatisticsFocus;
  gaps: StoreGap[];
};

const INVENTORY_CATEGORIES = [...categoryOptions.map((option) => option.value as string), INVENTORY_NO_CATEGORY];
const values = <T extends string>(options: readonly { value: T }[]) => options.map((option) => option.value);

// The JSON schema of the answer (output_config.format). Structured outputs take enum, required and
// additionalProperties: false on every object, and no length limits, so lengths are checked in parseStoreAnswer.
export function storeQuestionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["destination", "inventory", "statistics", "gaps"],
    properties: {
      destination: { type: "string", enum: [...STORE_DESTINATIONS] },
      inventory: {
        type: "object",
        additionalProperties: false,
        required: ["search", "stock", "publication", "category", "price", "sort"],
        properties: {
          search: { type: "string" },
          stock: { type: "string", enum: values(STOCK_FILTERS) },
          publication: { type: "string", enum: values(PUBLICATION_FILTERS) },
          category: { type: "string", enum: ["", ...INVENTORY_CATEGORIES] },
          price: { type: "string", enum: values(PRICE_FILTERS) },
          sort: { type: "string", enum: values(SORTS) },
        },
      },
      statistics: {
        type: "object",
        additionalProperties: false,
        required: ["period", "focus"],
        properties: {
          period: { type: "string", enum: [...STATISTICS_PERIODS] },
          focus: { type: "string", enum: ["", ...STATISTICS_FOCUS.map((focus) => focus.value)] },
        },
      },
      gaps: { type: "array", items: { type: "string", enum: [...STORE_GAPS] } },
    },
  };
}

export function storeQuestionSystemPrompt() {
  const categories = categoryOptions.map((option) => `${option.value} (${option.label})`).join(", ");
  return `You turn a question that the owner of a store on Laria, a Peruvian marketplace for musical instruments and audio gear, asks about their own store into the filters of the store's Inventario page, a view of its Estadísticas page, or its Reposición list. You never see the store's data, only the question. The owner writes in Spanish, often informally.

Destinations:
- inventory: the Inventario table, one row per SKU (a product the store stocks) with its units available, an optional low-stock alert per SKU (the "aviso"), an optional price and an optional publication on Laria.
- statistics: the Estadísticas page: views and WhatsApp contacts of the store's publications over a period, and the store's totals.
- reorder: the Reposición list: SKUs that are out of stock or at or under their aviso, with the units sold in the last 30 days and a suggested quantity to order.
- none: the question is not about the store's inventory, publications or statistics.

Inventory filters (keep the default of anything the question doesn't ask for):
- search: a product name, brand, model or SKU to look for, as the owner wrote it. Default "".
- stock: all (default: every active SKU), in_stock (available above its aviso), low (Stock bajo: available, at or under its aviso), out (Agotado: none available), archived (Archivados).
- publication: "" (default: any), none (Sin publicación), published (Publicada), in_review (in review: new or with changes), pending (new, in review), changes_pending (changes in review), rejected (Rechazada), hidden (Oculta).
- category: "" (default: all), ${categories}, ${INVENTORY_NO_CATEGORY} (Sin categoría).
- price: "" (default), none (Sin precio: SKUs without a price).
- sort: updated (default: recent changes first), name (A to Z), available_asc (least available first), available_desc (most available first), price_asc (cheapest first), price_desc (most expensive first).

Statistics:
- period: 7 (last 7 days), 30 (last 30 days, the default), all (all time).
- focus: "" (the whole page), views (most viewed publications), contacts (most contacted publications), unsold_contacts (publications with contacts and no sale in 30 days), totals (the store's totals).

gaps: one code for each part of the question that no filter can express, while you still pick the closest filters:
- quantity: a number of units ("menos de 3 unidades"): use stock low and sort available_asc.
- sales: units sold or best sellers per product: use reorder (it shows units sold in 30 days) or the statistics.
- dates: a period other than 7 days, 30 days or all time ("este mes", "ayer", "en marzo"): use the closest period.
- price_range: a price range ("más de 1000 soles"): sort by price.
- other: anything else no filter covers.
Leave gaps empty when the filters express the whole question. When the destination is not inventory, keep every inventory filter at its default; when it is not statistics, use period 30 and focus "".`;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The model's answer, checked against the site's own lists: anything outside them makes the answer invalid (null),
// never a link with a made-up value. The search text keeps letters, numbers and common punctuation, up to 60
// characters, as Inventario's own search box would.
export function parseStoreAnswer(data: unknown): StoreAnswer | null {
  if (!isObject(data) || !isObject(data.inventory) || !isObject(data.statistics) || !Array.isArray(data.gaps)) return null;
  const inventory = data.inventory;
  const destination = pick(data.destination, STORE_DESTINATIONS, "none");
  if (destination !== data.destination) return null;
  const checks: [unknown, readonly string[]][] = [
    [inventory.stock, values(STOCK_FILTERS)],
    [inventory.publication, values(PUBLICATION_FILTERS)],
    [inventory.category, ["", ...INVENTORY_CATEGORIES]],
    [inventory.price, values(PRICE_FILTERS)],
    [inventory.sort, values(SORTS)],
    [data.statistics.period, STATISTICS_PERIODS],
    [data.statistics.focus, ["", ...STATISTICS_FOCUS.map((focus) => focus.value)]],
  ];
  if (checks.some(([value, allowed]) => typeof value !== "string" || !allowed.includes(value))) return null;
  if (typeof inventory.search !== "string" || data.gaps.some((gap) => !(STORE_GAPS as readonly unknown[]).includes(gap))) return null;
  const search = inventory.search.replace(/[^\p{L}\p{N}\s.,'"/#&+()-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  const answer: StoreAnswer = {
    destination,
    filters: destination === "inventory" ? {
      q: search,
      stock: inventory.stock as InventoryFilters["stock"],
      publication: inventory.publication as InventoryFilters["publication"],
      catalog: "",
      category: inventory.category as string,
      price: inventory.price as InventoryFilters["price"],
      sort: inventory.sort as InventoryFilters["sort"],
    } : DEFAULT_FILTERS,
    period: destination === "statistics" ? data.statistics.period as StatisticsPeriod : "30",
    focus: destination === "statistics" ? data.statistics.focus as StatisticsFocus : "",
    gaps: [...new Set(data.gaps as StoreGap[])],
  };
  return answer;
}

// A page's link with the panel open: the answer's own, or one that keeps it after a chip is removed.
export function understoodHref(path: string, gaps: readonly StoreGap[], extra: Record<string, string> = {}) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  params.set(UNDERSTOOD_PARAM, "1");
  if (gaps.length) params.set(GAPS_PARAM, gaps.join(","));
  return `${base}?${params.toString()}`;
}

// Where the answer takes the owner, with the existing link helpers; null when the question found no destination.
export function storeAnswerHref(answer: StoreAnswer): string | null {
  if (answer.destination === "inventory") return understoodHref(inventoryHref(answer.filters), answer.gaps);
  if (answer.destination === "statistics") {
    return understoodHref("/mi-cuenta/tienda/estadisticas", answer.gaps, {
      periodo: answer.period === "all" ? "0" : answer.period,
      [FOCUS_PARAM]: answer.focus,
    });
  }
  if (answer.destination === "reorder") return understoodHref("/mi-cuenta/tienda/inventario/reponer", answer.gaps);
  return null;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

// The panel's state from a page's own address: shown only with asi=1; unknown gap codes are dropped.
export function understoodFromParams(params: SearchParams): { gaps: StoreGap[] } | null {
  if (first(params[UNDERSTOOD_PARAM]) !== "1") return null;
  const gaps = first(params[GAPS_PARAM]).split(",").filter((gap): gap is StoreGap => (STORE_GAPS as readonly string[]).includes(gap));
  return { gaps: [...new Set(gaps)] };
}

export function statisticsFocusFromParams(params: SearchParams): StatisticsFocus {
  return pick(first(params[FOCUS_PARAM]), STATISTICS_FOCUS.map((focus) => focus.value), "") as StatisticsFocus;
}

// ------------------------------------------------------------------ "Así lo entendí"

export type UnderstoodChip = { text: string; label: string; href: string };
export type Understood = { summary: string; chips: UnderstoodChip[]; gaps: StoreGap[]; closeHref: string; sectionHref?: string; sectionLabel?: string };

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

// Each filter the answer used, as a chip that removes it and keeps the panel open.
export function inventoryUnderstood(filters: InventoryFilters, gaps: StoreGap[]): Understood {
  const chip = (text: string, label: string, without: Partial<InventoryFilters>): UnderstoodChip =>
    ({ text, label, href: understoodHref(inventoryHref({ ...filters, ...without }), gaps) });
  const chips: UnderstoodChip[] = [];
  if (filters.q) chips.push(chip(`«${filters.q}»`, `Búsqueda: ${filters.q}`, { q: "" }));
  if (filters.stock !== "all") chips.push(chip(labelOf(STOCK_FILTERS, filters.stock), `Stock: ${labelOf(STOCK_FILTERS, filters.stock)}`, { stock: "all" }));
  if (filters.publication) {
    chips.push(chip(labelOf(PUBLICATION_FILTERS, filters.publication), `Publicación: ${labelOf(PUBLICATION_FILTERS, filters.publication)}`, { publication: "" }));
  }
  if (filters.category) {
    const category = filters.category === INVENTORY_NO_CATEGORY ? "Sin categoría"
      : categoryOptions.find((option) => option.value === filters.category)?.label ?? filters.category;
    chips.push(chip(category, `Categoría: ${category}`, { category: "" }));
  }
  if (filters.price) chips.push(chip(labelOf(PRICE_FILTERS, filters.price), `Precio: ${labelOf(PRICE_FILTERS, filters.price)}`, { price: "" }));
  if (filters.sort !== DEFAULT_FILTERS.sort) chips.push(chip(`Orden: ${labelOf(SORTS, filters.sort)}`, `Orden: ${labelOf(SORTS, filters.sort)}`, { sort: DEFAULT_FILTERS.sort }));
  return { summary: chips.length ? "" : "todo tu inventario activo", chips, gaps, closeHref: inventoryHref(filters) };
}

export function statisticsUnderstood(days: 0 | 7 | 30, focus: StatisticsFocus, gaps: StoreGap[]): Understood {
  const path = "/mi-cuenta/tienda/estadisticas";
  const section = STATISTICS_FOCUS.find((entry) => entry.value === focus);
  const chips: UnderstoodChip[] = [];
  // Without a period the page shows all the history.
  if (days) chips.push({ text: `Últimos ${days} días`, label: `Periodo: últimos ${days} días`, href: understoodHref(path, gaps, { periodo: "0", [FOCUS_PARAM]: focus }) });
  if (section) chips.push({ text: section.label, label: `Sección: ${section.label}`, href: understoodHref(path, gaps, { periodo: String(days) }) });
  return {
    summary: chips.length ? "" : "todo el historial de tus estadísticas",
    chips,
    gaps,
    closeHref: `${path}?periodo=${days}`,
    ...(section ? { sectionHref: `#${section.anchor}`, sectionLabel: `Ir a ${section.label}` } : {}),
  };
}

export function reorderUnderstood(gaps: StoreGap[]): Understood {
  return {
    summary: "lo que conviene reponer: los SKU agotados o en su aviso de stock bajo, con lo vendido en 30 días",
    chips: [],
    gaps,
    closeHref: "/mi-cuenta/tienda/inventario/reponer",
  };
}
