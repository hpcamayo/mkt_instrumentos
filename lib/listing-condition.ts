// sell-10 "Estado detallado" (docs/feature-ideas/listing-details.md): a gear-specific condition scale, after Reverb's,
// in plain Spanish. Each step has a one-line definition the seller reads while choosing and a buyer reads on tap.
// The database checks the same values (public.listing_condition_is_valid, 20261202120000) and maps the old three.
// Pure, with no imports, so the forms, the catalog, the import and the tests share it.

export type ConditionStep = {
  value: string;
  definition: string;
  // Only a store sells "Exhibición o caja abierta".
  storeOnly?: boolean;
};

// Best to worst, in the order every list shows them. Open box sits after Nuevo: it is new stock that was handled.
export const conditionScale: readonly ConditionStep[] = [
  { value: "Nuevo", definition: "Sin uso, con todo lo que trae de fábrica." },
  {
    value: "Exhibición o caja abierta",
    definition: "Nuevo de tienda, de exhibición o con la caja abierta. Puede tener marcas mínimas de prueba.",
    storeOnly: true,
  },
  { value: "Como nuevo", definition: "Usado muy poco. Sin marcas a la vista y funciona perfecto." },
  { value: "Excelente", definition: "Uso cuidadoso. Marcas mínimas que solo se ven de cerca; funciona perfecto." },
  { value: "Muy bueno", definition: "Uso normal. Marcas o rayones leves; todo funciona bien." },
  { value: "Bueno", definition: "Uso evidente. Rayones, golpes o desgaste a la vista; funciona bien." },
  { value: "Regular", definition: "Desgaste fuerte o algo que conviene revisar (ruidos, trastes, perillas). Funciona." },
  { value: "Para reparar", definition: "No funciona del todo o necesita arreglo. Para repuestos o para quien repara." },
];

export const CONDITION_VALUES: readonly string[] = conditionScale.map((step) => step.value);
export const PARTICULAR_CONDITION_VALUES: readonly string[] = conditionScale.filter((step) => !step.storeOnly).map((step) => step.value);

// FD-listing-details-1: an old stored value becomes one step, and an old search (a saved alert, a bookmarked link)
// becomes the steps it covered, so it keeps finding everything it found before.
export const LEGACY_CONDITION_VALUE: Readonly<Record<string, string>> = {
  "Usado - buen estado": "Muy bueno",
  "Usado - con detalles": "Bueno",
};

export const LEGACY_CONDITION_SEARCH: Readonly<Record<string, readonly string[]>> = {
  "Usado - buen estado": ["Exhibición o caja abierta", "Como nuevo", "Excelente", "Muy bueno"],
  "Usado - con detalles": ["Bueno", "Regular", "Para reparar"],
};

export function currentCondition(value: string): string;
export function currentCondition(value: string | null | undefined): string | null;
export function currentCondition(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  return LEGACY_CONDITION_VALUE[value] ?? value;
}

export function isValidCondition(value: string | null | undefined, isStore: boolean) {
  if (!value) return false;
  const step = conditionScale.find((item) => item.value === value);
  return Boolean(step && (isStore || !step.storeOnly));
}

// A search's conditions on today's scale, in scale order: old values expand, unknown ones are dropped.
export function expandConditionSearch(values: readonly string[]) {
  const wanted = new Set(values.flatMap((value) => LEGACY_CONDITION_SEARCH[value] ?? [value]));
  return CONDITION_VALUES.filter((value) => wanted.has(value));
}

export function conditionDefinition(value: string | null | undefined) {
  const current = currentCondition(value);
  return conditionScale.find((step) => step.value === current)?.definition ?? null;
}

// The 1-based position on the particular scale ("4 de 7"), so the step reads as a place on a scale, not a word alone.
export function conditionRank(value: string | null | undefined) {
  const current = currentCondition(value);
  if (current === "Exhibición o caja abierta") return null;
  const index = PARTICULAR_CONDITION_VALUES.indexOf(current ?? "");
  return index < 0 ? null : { position: index + 1, of: PARTICULAR_CONDITION_VALUES.length };
}

// Several steps in a few words, for an alert's summary: a run of three or more reads as a range ("Como nuevo a Muy
// bueno"), open box is named last ("…, o caja abierta"), the rest are listed.
export function conditionSetLabel(values: readonly string[]) {
  const steps = expandConditionSearch(values);
  if (steps.length === CONDITION_VALUES.length - 1 && !steps.includes("Nuevo")) return "Usado, cualquier estado";
  const openBox = steps.includes("Exhibición o caja abierta");
  const rest = steps.filter((value) => value !== "Exhibición o caja abierta");
  const positions = rest.map((value) => PARTICULAR_CONDITION_VALUES.indexOf(value));
  const contiguous = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
  const label = rest.length >= 3 && contiguous ? `${rest[0]} a ${rest[rest.length - 1]}` : rest.join(", ");
  if (!openBox) return label;
  return label ? `${label}, o caja abierta` : "Exhibición o caja abierta";
}

// schema.org offer condition: new, damaged (for repair) or used. Open box is sold as used, as Google asks of
// "open box" and "display" items.
export function conditionSchemaOrg(value: string | null | undefined) {
  const current = currentCondition(value);
  if (current === "Nuevo") return "https://schema.org/NewCondition";
  if (current === "Para reparar") return "https://schema.org/DamagedCondition";
  return "https://schema.org/UsedCondition";
}

// Words people write in a spreadsheet or a search box, as written; matched folded (lower case, no accents, single
// spaces). "usado" alone is no step: the search box reads it as "any used", the import asks the store to choose.
const conditionSynonymsAsWritten: readonly (readonly [string, string])[] = [
  ["nuevo", "Nuevo"],
  ["nueva", "Nuevo"],
  ["new", "Nuevo"],
  ["nuevo en caja", "Nuevo"],
  ["sellado", "Nuevo"],
  ["open box", "Exhibición o caja abierta"],
  ["caja abierta", "Exhibición o caja abierta"],
  ["exhibición", "Exhibición o caja abierta"],
  ["de exhibición", "Exhibición o caja abierta"],
  ["como nueva", "Como nuevo"],
  ["seminuevo", "Como nuevo"],
  ["seminueva", "Como nuevo"],
  ["semi nuevo", "Como nuevo"],
  ["mint", "Como nuevo"],
  ["excellent", "Excelente"],
  ["muy buena", "Muy bueno"],
  ["very good", "Muy bueno"],
  ["buen estado", "Muy bueno"],
  ["usado buen estado", "Muy bueno"],
  ["buena", "Bueno"],
  ["good", "Bueno"],
  ["con detalles", "Bueno"],
  ["usado con detalles", "Bueno"],
  ["fair", "Regular"],
  ["para repuestos", "Para reparar"],
  ["malogrado", "Para reparar"],
  ["no funciona", "Para reparar"],
];

export function foldConditionText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

// Every step under its own name, then the synonyms, folded once.
const conditionByText: ReadonlyMap<string, string> = new Map([
  ...conditionScale.map((step) => [foldConditionText(step.value), step.value] as const),
  ...conditionSynonymsAsWritten.map(([text, value]) => [foldConditionText(text), value] as const),
]);

// A condition someone typed, as a step (or null when it is no step).
export function conditionFromText(value: string) {
  return conditionByText.get(foldConditionText(value)) ?? null;
}
