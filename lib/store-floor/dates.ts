// Dates for the store-floor features (docs/feature-ideas/store-floor.md), always on Lima's calendar (UTC-5, no
// daylight saving), the way stores and buyers say them: "15/12", "sábado 14 de diciembre", "11:00 a. m.".

export const LIMA = "America/Lima";
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
// Peru writes "setiembre".
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

// Today in Lima as "YYYY-MM-DD".
export function limaToday(now: number = Date.now()) {
  return new Date(now - LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

function parts(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

// "15/12" (and "15/12/2027" when it is not this year).
export function shortDate(isoDate: string, today = limaToday()) {
  const { year, month, day } = parts(isoDate);
  const base = `${day}/${String(month).padStart(2, "0")}`;
  return String(year) === today.slice(0, 4) ? base : `${base}/${year}`;
}

// "15 de diciembre" (and "15 de diciembre de 2027" when it is not this year).
export function longDate(isoDate: string, today = limaToday()) {
  const { year, month, day } = parts(isoDate);
  const base = `${day} de ${MONTHS[month - 1]}`;
  return String(year) === today.slice(0, 4) ? base : `${base} de ${year}`;
}

// "sábado 14 de diciembre"; "hoy" and "mañana" when it is.
export function dayLabel(isoDate: string, today = limaToday(), relative = true) {
  if (relative && isoDate === today) return "hoy";
  if (relative && isoDate === addDays(today, 1)) return "mañana";
  const { month, day, weekday } = parts(isoDate);
  return `${WEEKDAYS[weekday]} ${day} de ${MONTHS[month - 1]}`;
}

// The Lima calendar day and clock of an instant.
export function limaParts(instant: string | number | Date) {
  const shifted = new Date(new Date(instant).getTime() - LIMA_OFFSET_MS);
  return { date: shifted.toISOString().slice(0, 10), hours: shifted.getUTCHours(), minutes: shifted.getUTCMinutes() };
}

// "11:00 a. m.", "3:30 p. m.", "12:00 p. m." (as laria_private.tryout_when_label writes it).
export function clockLabel(hours: number, minutes: number) {
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "a. m." : "p. m."}`;
}

export function timeLabel(instant: string | number | Date) {
  const { hours, minutes } = limaParts(instant);
  return clockLabel(hours, minutes);
}

// "sábado 14 de diciembre, 11:00 a. m." with "hoy"/"mañana" when relative.
export function whenLabel(instant: string | number | Date, today = limaToday(), relative = false) {
  const { date } = limaParts(instant);
  return `${dayLabel(date, today, relative)}, ${timeLabel(instant)}`;
}
