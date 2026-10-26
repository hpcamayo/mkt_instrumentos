import { addDays, isIsoDate, limaToday, longDate, shortDate } from "@/lib/store-floor/dates";

// reach-08 "Por llegar" (supabase/migrations/20261206120100_feat_stock_arrivals.sql). A SKU without units can carry
// the date the store expects more; its listing stays "out of stock" with that date, so every out-of-stock rule holds.

// set_inventory_arrival accepts today to a year ahead (Lima).
export const ARRIVAL_MAX_DAYS = 365;

export function arrivalBounds(today = limaToday()) {
  return { min: today, max: addDays(today, ARRIVAL_MAX_DAYS) };
}

export function validArrivalDate(value: unknown, today = limaToday()): value is string {
  if (!isIsoDate(value)) return false;
  const { min, max } = arrivalBounds(today);
  return value >= min && value <= max;
}

// "Por llegar · 15/12" for tags and tables.
export function arrivalTag(date: string, today = limaToday()) {
  return `Por llegar · ${shortDate(date, today)}`;
}

// The line under the price on the listing page.
export function restockNote(date: string | null | undefined, today = limaToday()) {
  if (!date) return "Sin unidades disponibles por ahora. Te avisamos cuando vuelva, o consulta a la tienda.";
  return `Por llegar: la tienda espera unidades para el ${longDate(date, today)} (fecha estimada). Te avisamos cuando lleguen, o consulta a la tienda.`;
}

// Quick picks in the owner's date sheet: in one week, two weeks, a month.
export function arrivalPresets(today = limaToday()) {
  return [
    { label: "En 1 semana", value: addDays(today, 7) },
    { label: "En 2 semanas", value: addDays(today, 14) },
    { label: "En 1 mes", value: addDays(today, 30) },
  ];
}

export const ARRIVAL_ERRORS: Record<string, string> = {
  INVENTORY_ARRIVAL_INVALID: "Elige entre 1 y 200 SKU.",
  INVENTORY_ARRIVAL_DATE_INVALID: "Elige una fecha desde hoy y hasta dentro de un año.",
};
