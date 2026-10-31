// listing-details × discovery: the maker marks as the sell form holds them ("maker" listing detail). The rules are
// discovery's (supabase/migrations/20261207120400 set_listing_maker_details); the database writer
// (20261202120700 write_listing_maker_details) has the final word. Pure, so the form, the route and the tests share it.

export const MAKER_KEY = "maker";
export const MADE_TO_ORDER_MIN = 1;
export const MADE_TO_ORDER_MAX = 26;
export const ARTIST_NOTE_MIN = 3;
export const ARTIST_NOTE_MAX = 140;

// What this seller may mark: "Hecho a mano" and "a pedido" need a shown maker profile on their store, the note a
// verified artist (discovery's rules). Neither: the form shows nothing.
export type MakerAccess = { handmade: boolean; artistNote: boolean };

export type MakerForm = { handmade: boolean; to_order: boolean; weeks: string; artist_note: string };

export function emptyMakerForm(): MakerForm {
  return { handmade: false, to_order: false, weeks: "", artist_note: "" };
}

export function readMakerForm(input: unknown): MakerForm {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return {
    handmade: raw.handmade === true,
    to_order: raw.to_order === true,
    weeks: typeof raw.weeks === "string" ? raw.weeks : typeof raw.weeks === "number" ? String(raw.weeks) : "",
    artist_note: typeof raw.artist_note === "string" ? raw.artist_note : "",
  };
}

export type MakerPayload = { handmade: boolean; made_to_order_weeks: number | null; artist_note: string | null };
export type MakerResult = { ok: true; value: MakerPayload } | { ok: false; field: "weeks" | "artist_note"; message: string };

// The writer's JSON, or the first problem with its field. Accepts the form shape or the writer's own.
export function cleanMakerDetails(input: unknown): MakerResult {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const form = "made_to_order_weeks" in raw
    ? { handmade: raw.handmade === true, to_order: raw.made_to_order_weeks !== null && raw.made_to_order_weeks !== undefined, weeks: String(raw.made_to_order_weeks ?? ""), artist_note: typeof raw.artist_note === "string" ? raw.artist_note : "" }
    : readMakerForm(raw);
  let weeks: number | null = null;
  if (form.to_order) {
    weeks = /^\d{1,2}$/.test(form.weeks.trim()) ? Number(form.weeks.trim()) : NaN;
    if (!Number.isInteger(weeks) || weeks < MADE_TO_ORDER_MIN || weeks > MADE_TO_ORDER_MAX) {
      return { ok: false, field: "weeks", message: `Indica entre ${MADE_TO_ORDER_MIN} y ${MADE_TO_ORDER_MAX} semanas.` };
    }
  }
  const note = form.artist_note.replace(/\s+/g, " ").trim();
  if (note && (note.length < ARTIST_NOTE_MIN || note.length > ARTIST_NOTE_MAX)) {
    return { ok: false, field: "artist_note", message: `La nota admite entre ${ARTIST_NOTE_MIN} y ${ARTIST_NOTE_MAX} caracteres.` };
  }
  return { ok: true, value: { handmade: form.handmade, made_to_order_weeks: weeks, artist_note: note || null } };
}
