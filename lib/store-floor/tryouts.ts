import { buildWhatsAppHref } from "@/lib/phone";
import { clockLabel, dayLabel, limaParts, limaToday, whenLabel } from "@/lib/store-floor/dates";

// buy-07 "Reservar una prueba" (supabase/migrations/20261206120200_feat_store_tryouts.sql). A try-out holds a time at
// the store, never the instrument. Laria sends notices and e-mails; WhatsApp messages are links each side opens.

export type TryoutStatus = "requested" | "confirmed" | "declined" | "cancelled" | "expired";

// laria_private.tryout_json.
export type Tryout = {
  id: string;
  store_id: string;
  listing_id: string | null;
  listing_title: string;
  listing_slug: string | null;
  buyer_user_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_note: string | null;
  starts_at: string;
  ends_at: string;
  status: TryoutStatus;
  cancelled_by: "buyer" | "store" | null;
  store_reason: string | null;
  created_at: string;
  when_label: string;
  replayed?: boolean;
  store: { name: string; slug: string; whatsapp_phone: string | null; public_address: string | null; district: string | null; city: string | null } | null;
};

export type TryoutSlots = { available: boolean; store_name?: string; slot_minutes?: number; note?: string | null; slots: string[] };

export type WeeklyHours = Record<string, [string, string][]>;

export type TryoutSettings = {
  enabled: boolean;
  weekly_hours: WeeklyHours;
  slot_minutes: number;
  capacity: number;
  min_notice_hours: number;
  max_days_ahead: number;
  note: string | null;
};

export const DEFAULT_TRYOUT_SETTINGS: TryoutSettings = {
  enabled: false,
  weekly_hours: {},
  slot_minutes: 30,
  capacity: 1,
  min_notice_hours: 3,
  max_days_ahead: 14,
  note: null,
};

// ISO weekdays as the settings store them (1 = lunes).
export const WEEKDAYS: { key: string; label: string; short: string }[] = [
  { key: "1", label: "Lunes", short: "Lun" },
  { key: "2", label: "Martes", short: "Mar" },
  { key: "3", label: "Miércoles", short: "Mié" },
  { key: "4", label: "Jueves", short: "Jue" },
  { key: "5", label: "Viernes", short: "Vie" },
  { key: "6", label: "Sábado", short: "Sáb" },
  { key: "7", label: "Domingo", short: "Dom" },
];

export const SLOT_MINUTE_CHOICES = [15, 30, 45, 60, 90];
export const NOTICE_HOUR_CHOICES = [1, 2, 3, 6, 12, 24, 48];
export const DAYS_AHEAD_CHOICES = [3, 7, 14, 21, 30];
export const BUYER_NOTE_MAX = 280;
export const STORE_NOTE_MAX = 200;
export const REASON_MAX = 200;

// Every quarter hour from 06:00 to 23:00, the range read_tryout_hours accepts.
export const QUARTER_HOURS = Array.from({ length: (23 - 6) * 4 + 1 }, (_, index) => {
  const minutes = 6 * 60 + index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export function hourLabel(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return clockLabel(hours, minutes);
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

// "Agregar otro horario": a day that spans lunch splits around it (10:00–13:00 and 15:00–19:00); otherwise a second
// range starts an hour after the first ends. Ranges stay in order and never overlap, as read_tryout_hours requires.
export function splitForSecondRange([from, to]: [string, string]): [string, string][] {
  const start = toMinutes(from);
  const end = toMinutes(to);
  if (start < 13 * 60 && end > 15 * 60) return [[from, "13:00"], ["15:00", to]];
  const nextStart = Math.min(end + 60, 22 * 60);
  if (nextStart > end) return [[from, to], [fromMinutes(nextStart), fromMinutes(Math.min(nextStart + 120, 23 * 60))]];
  return [[from, to]];
}

// "Lun a vie 10:00 a. m. – 7:00 p. m. · Sáb 10:00 a. m. – 1:00 p. m." for the owner's summary.
export function hoursSummary(hours: WeeklyHours) {
  const groups: { days: string[]; text: string }[] = [];
  for (const day of WEEKDAYS) {
    const ranges = hours[day.key] ?? [];
    if (!ranges.length) continue;
    const text = ranges.map(([from, to]) => `${hourLabel(from)} – ${hourLabel(to)}`).join(" y ");
    const last = groups[groups.length - 1];
    const previousKey = String(Number(day.key) - 1);
    if (last && last.text === text && last.days[last.days.length - 1] === previousKey) last.days.push(day.key);
    else groups.push({ days: [day.key], text });
  }
  if (!groups.length) return "Sin horario";
  const short = (key: string) => WEEKDAYS.find((day) => day.key === key)?.short ?? key;
  return groups
    .map((group) => {
      const first = short(group.days[0]);
      const label = group.days.length === 1 ? first : group.days.length === 2 ? `${first} y ${short(group.days[1]).toLowerCase()}` : `${first} a ${short(group.days[group.days.length - 1]).toLowerCase()}`;
      return `${label} ${group.text}`;
    })
    .join(" · ");
}

// The free slots grouped by Lima day, for the day chips and the time chips.
export function groupSlots(slots: string[], today = limaToday()) {
  const days: { date: string; label: string; times: { value: string; label: string }[] }[] = [];
  for (const slot of slots) {
    const { date, hours, minutes } = limaParts(slot);
    let day = days[days.length - 1];
    if (!day || day.date !== date) {
      day = { date, label: dayLabel(date, today), times: [] };
      days.push(day);
    }
    day.times.push({ value: slot, label: clockLabel(hours, minutes) });
  }
  return days;
}

const STATUS_LABELS: Record<TryoutStatus, string> = {
  requested: "Por confirmar",
  confirmed: "Confirmada",
  declined: "No confirmada",
  cancelled: "Cancelada",
  expired: "Sin respuesta",
};

export function tryoutStatusLabel(tryout: Pick<Tryout, "status" | "cancelled_by">, side: "buyer" | "store") {
  if (tryout.status === "cancelled") {
    if (tryout.cancelled_by === "buyer") return side === "buyer" ? "La cancelaste" : "Cancelada por el cliente";
    return side === "store" ? "La cancelaste" : "Cancelada por la tienda";
  }
  return STATUS_LABELS[tryout.status];
}

export function isOpen(tryout: Pick<Tryout, "status" | "ends_at">, now = Date.now()) {
  return (tryout.status === "requested" || tryout.status === "confirmed") && Date.parse(tryout.ends_at) > now;
}

// The store writes to the buyer, and the buyer to the store, with the details already in the message.
export function storeWhatsAppHref(tryout: Tryout) {
  const when = whenLabel(tryout.starts_at);
  const message = tryout.status === "confirmed"
    ? `Hola ${tryout.buyer_name}, te esperamos el ${when} en ${tryout.store?.name ?? "la tienda"} para probar ${tryout.listing_title}.`
    : `Hola ${tryout.buyer_name}, te escribimos de ${tryout.store?.name ?? "la tienda"} por tu prueba de ${tryout.listing_title} (${when}).`;
  return buildWhatsAppHref(tryout.buyer_phone, message);
}

export function buyerWhatsAppHref(tryout: Tryout) {
  if (!tryout.store?.whatsapp_phone) return null;
  return buildWhatsAppHref(tryout.store.whatsapp_phone, `Hola, reservé en Laria una prueba de ${tryout.listing_title} para el ${whenLabel(tryout.starts_at)}.`);
}

export function storePlace(store: Tryout["store"]) {
  if (!store) return null;
  return [store.public_address, store.district, store.city].filter(Boolean).join(", ") || null;
}

function icsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsTime(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// A calendar file for a confirmed try-out ("Agregar al calendario"), as a data: URL the phone opens.
export function tryoutCalendarHref(tryout: Tryout, siteUrl: string) {
  const place = storePlace(tryout.store);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Laria//Pruebas//ES",
    "BEGIN:VEVENT",
    `UID:${tryout.id}@laria`,
    `DTSTAMP:${icsTime(new Date().toISOString())}`,
    `DTSTART:${icsTime(tryout.starts_at)}`,
    `DTEND:${icsTime(tryout.ends_at)}`,
    `SUMMARY:${icsText(`Prueba: ${tryout.listing_title}`)}`,
    `DESCRIPTION:${icsText(`En ${tryout.store?.name ?? "la tienda"}. ${tryout.listing_slug ? `${siteUrl}/instrumentos/${tryout.listing_slug}` : ""}`.trim())}`,
    ...(place ? [`LOCATION:${icsText(place)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

// "TRYOUT_X: message" from the database, as a message for people.
export function tryoutErrorMessage(raw: string | null | undefined) {
  const match = raw?.match(/^TRYOUT_[A-Z_]+: ([\s\S]+)$/);
  return match ? match[1] : "No pudimos completar la acción. Intenta nuevamente.";
}

export function tryoutErrorCode(raw: string | null | undefined) {
  return raw?.match(/^(TRYOUT_[A-Z_]+):/)?.[1] ?? "UNKNOWN";
}

// A key per booking attempt, so a retried request returns the first booking instead of a second one.
export function newTryoutKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `prueba:${random}`;
}
