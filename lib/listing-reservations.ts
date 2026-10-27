// Effortless Laria maybes, talk-06 "Reservado" (docs/ux-effortless/maybes-reservado.md): a Particular seller reserves a
// published listing for 1, 2, 3 or 5 days; buyers can ask "Avísame si se libera"; when the period ends the seller is
// asked "¿Se vendió?". The database side is supabase/migrations/20261120100000_ux_maybes_reservado.sql.
//
// Every call to the feature's tables and functions goes through this module. They are not in the generated Database
// type yet, so the calls below use one untyped view of the caller's client (db); RLS and the functions still decide
// what the caller may see and change. Once the types are generated, db() and the parse functions can go.
// Pure apart from the calls, and without a Supabase import that runs, so the server, the routes and the browser
// components can all use it.
import type { SupabaseClient } from "@supabase/supabase-js";

export const RESERVATION_DAYS = [1, 2, 3, 5] as const;
export type ReservationDays = (typeof RESERVATION_DAYS)[number];

// public.get_reserved_listings: a running period of a published Particular listing.
export type ReservedListing = { listing_id: string; reserved_until: string };
// public.get_my_listing_reservations: the seller's own periods, running or ended and waiting for an answer.
export type MyListingReservation = {
  listing_id: string;
  title: string;
  slug: string;
  reserved_until: string;
  ended_at: string | null;
  // How many people asked "Avísame si se libera".
  watchers: number;
};
export type ReservationOutcome = "available" | "sold";
type Result<T> = { data: T; error: null } | { data: null; error: string };

function db(client: object) {
  return client as SupabaseClient;
}

// ------------------------------------------------------------------ reads

// The function reads up to 200 ids a call.
const READ_CHUNK = 200;

// The running periods among `ids`. Null when a read failed: callers show the listings as not reserved.
export async function readReservedListings(client: object, ids: string[], signal?: AbortSignal): Promise<ReservedListing[] | null> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += READ_CHUNK) chunks.push(unique.slice(index, index + READ_CHUNK));
  const results = await Promise.all(chunks.map((chunk) => {
    const query = db(client).rpc("get_reserved_listings", { p_listing_ids: chunk });
    return signal ? query.abortSignal(signal) : query;
  }));
  if (results.some((result) => result.error)) return null;
  return results.flatMap((result) => parseReservedListings(result.data));
}

// For any list of cards (the catalog, Descubrir): the ids among `ids` that are reserved right now, or null when the read
// failed. lib/listing-reservations-server.ts wraps it for public renders (recovery switch, budget and breaker).
export async function reservedListingIds(client: object, ids: string[], signal?: AbortSignal): Promise<Set<string> | null> {
  if (!ids.length) return new Set();
  const rows = await readReservedListings(client, ids, signal);
  return rows ? new Set(rows.map((row) => row.listing_id)) : null;
}

// The signed-in seller's periods (Mis publicaciones, Pendientes). Null when the read failed.
export async function readMyListingReservations(client: object): Promise<MyListingReservation[] | null> {
  const { data, error } = await db(client).rpc("get_my_listing_reservations");
  return error ? null : parseMyListingReservations(data);
}

// Whether the signed-in visitor asked "Avísame si se libera" on this listing. Null when the read failed.
export async function readReleaseWatch(client: object, listingId: string): Promise<boolean | null> {
  const { data, error } = await db(client).rpc("get_listing_release_watch", { p_listing_id: listingId });
  return error ? null : data === true;
}

// ------------------------------------------------------------------ writes

// Reserves for `days` from now (again on a reserved listing, the new period replaces the old one). The end of the period.
export async function setListingReservation(client: object, listingId: string, days: ReservationDays): Promise<Result<string>> {
  const { data, error } = await db(client).rpc("set_listing_reservation", { p_listing_id: listingId, p_days: days });
  if (error) return { data: null, error: error.message };
  return typeof data === "string" ? { data, error: null } : { data: null, error: "" };
}

// "Sigue disponible" or "Se vendió" (the ordinary sold flow). How many people waiting were told.
export async function endListingReservation(client: object, listingId: string, outcome: ReservationOutcome): Promise<Result<number>> {
  const { data, error } = await db(client).rpc("end_listing_reservation", { p_listing_id: listingId, p_outcome: outcome });
  if (error) return { data: null, error: error.message };
  return { data: typeof data === "number" ? data : 0, error: null };
}

// "Avísame si se libera" on and off. Whether the visitor is now waiting.
export async function setReleaseWatch(client: object, listingId: string, watch: boolean): Promise<Result<boolean>> {
  const { data, error } = await db(client).rpc("set_listing_release_watch", { p_listing_id: listingId, p_watch: watch });
  if (error) return { data: null, error: error.message };
  return { data: data === true, error: null };
}

// ------------------------------------------------------------------ parsing

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" && value ? value : null);
const moment = (value: unknown) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null);

// Defensive, like lib/pendientes.ts: a malformed row is left out.
export function parseReservedListings(value: unknown): ReservedListing[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRow(row)) return [];
    const id = text(row.listing_id);
    const until = moment(row.reserved_until);
    return id && until ? [{ listing_id: id, reserved_until: until }] : [];
  });
}

export function parseMyListingReservations(value: unknown): MyListingReservation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRow(row)) return [];
    const id = text(row.listing_id);
    const until = moment(row.reserved_until);
    if (!id || !until || !text(row.title) || !text(row.slug)) return [];
    const watchers = typeof row.watchers === "number" && Number.isSafeInteger(row.watchers) && row.watchers > 0 ? row.watchers : 0;
    return [{ listing_id: id, title: row.title as string, slug: row.slug as string, reserved_until: until, ended_at: moment(row.ended_at), watchers }];
  });
}

export function parseReservationDays(value: unknown): ReservationDays | null {
  return typeof value === "number" && (RESERVATION_DAYS as readonly number[]).includes(value) ? (value as ReservationDays) : null;
}

export function parseReservationOutcome(value: unknown): ReservationOutcome | null {
  return value === "available" || value === "sold" ? value : null;
}

// The functions' own messages are written for people ("RESERVATION_DAYS_INVALID: Elige 1, 2, 3 o 5 días."): the text
// after the code, or null for any other error.
const KNOWN_ERROR = /^((?:RESERVATION|RELEASE_WATCH)_[A-Z_]+): ([\s\S]+)$/;
export function reservationErrorMessage(message: string | null | undefined) {
  const match = message ? KNOWN_ERROR.exec(message) : null;
  return match ? match[2] : null;
}

// ------------------------------------------------------------------ the period

// Running until its end, also in the minute before the job marks it ended: the badge goes at the end itself.
export function isReservationRunning(period: { reserved_until: string; ended_at?: string | null } | null | undefined, now = Date.now()) {
  if (!period || period.ended_at) return false;
  const end = Date.parse(period.reserved_until);
  return Number.isFinite(end) && end > now;
}

export function reservationDaysLabel(days: ReservationDays) {
  return days === 1 ? "1 día" : `${days} días`;
}

const LIMA = "America/Lima";
const longDate = new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, weekday: "long", day: "numeric", month: "long" });
const shortDate = new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, weekday: "short", day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, hour: "numeric", minute: "2-digit", hour12: true });

function pieces(format: Intl.DateTimeFormat, date: Date) {
  const found: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of format.formatToParts(date)) if (part.type !== "literal") found[part.type] = part.value;
  return found;
}

// The end in words, in Lima: "el jueves 29 de octubre a las 6:30 p. m." (a date, never "mañana": the listing page is
// cached, and a relative day would be wrong after midnight). Null for an unreadable date.
export function reservationEndText(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const { weekday, day, month } = pieces(longDate, date);
  const time = clock.format(date).replace(/\s+/g, " ");
  return `el ${weekday} ${day} de ${month} ${time.startsWith("1:") ? "a la" : "a las"} ${time}`;
}

// The short form for a tag: "Reservada hasta el jue 29 oct."
export function reservationTagText(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Reservada";
  const { weekday, day, month } = pieces(shortDate, date);
  return `Reservada hasta el ${weekday} ${day} ${month}`;
}

export function watchersText(watchers: number) {
  return watchers === 1 ? "1 persona pidió que le avisemos si se libera." : `${watchers} personas pidieron que les avisemos si se libera.`;
}
