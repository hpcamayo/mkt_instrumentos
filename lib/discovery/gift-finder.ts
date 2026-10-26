import { parseListingFilters, type ListingFilters } from "@/lib/listings";

// buy-05 "Para regalar" (docs/feature-ideas/discovery.md): pick who the gift is for and a budget, and see real
// listings, what to ask the seller and which stores accept gift exchanges. Curated filters over the public catalog;
// nothing here ranks, predicts or pushes a date. Pure, so the pages and the tests share it.

export const GIFTS_PATH = "/regalos";

export type GiftOccasion = {
  slug: string;
  label: string;
  heading: string;
  intro: string;
  // The next date this occasion falls on, from a day (Lima's calendar). Birthdays have none.
  nextDate?: (from: Date) => Date;
};

// The nth Sunday of a month (0-based month), as a UTC date.
function nthSunday(year: number, month: number, nth: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (7 - first.getUTCDay()) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

function nextOf(from: Date, dateFor: (year: number) => Date) {
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const thisYear = dateFor(from.getUTCFullYear());
  return thisYear.getTime() >= today ? thisYear : dateFor(from.getUTCFullYear() + 1);
}

export const giftOccasions: readonly GiftOccasion[] = [
  {
    slug: "navidad",
    label: "Navidad",
    heading: "Regalos de Navidad para músicos",
    intro: "Elige para quién es y cuánto quieres gastar: te mostramos instrumentos y accesorios reales de particulares y tiendas en Perú.",
    nextDate: (from) => nextOf(from, (year) => new Date(Date.UTC(year, 11, 25))),
  },
  {
    slug: "dia-de-la-madre",
    label: "Día de la Madre",
    heading: "Regalos para mamá, si toca o quiere empezar",
    intro: "Un teclado, una guitarra o un ukelele para empezar, o el accesorio que le falta. Elige para quién es y tu presupuesto.",
    nextDate: (from) => nextOf(from, (year) => nthSunday(year, 4, 2)),
  },
  {
    slug: "dia-del-padre",
    label: "Día del Padre",
    heading: "Regalos para papá músico",
    intro: "El pedal que quería, un amplificador para la casa o el instrumento que dejó de tocar. Elige para quién es y tu presupuesto.",
    nextDate: (from) => nextOf(from, (year) => nthSunday(year, 5, 3)),
  },
  {
    slug: "cumpleanos",
    label: "Cumpleaños",
    heading: "Regalos de cumpleaños para músicos",
    intro: "Elige para quién es y cuánto quieres gastar: te mostramos instrumentos y accesorios reales de particulares y tiendas en Perú.",
  },
];

// The dated occasions in the order they come next, then birthdays. Used only to order the chips; no countdown.
export function occasionsInOrder(from: Date) {
  const dated = giftOccasions.filter((occasion) => occasion.nextDate).sort((a, b) => a.nextDate!(from).getTime() - b.nextDate!(from).getTime());
  return [...dated, ...giftOccasions.filter((occasion) => !occasion.nextDate)];
}

export function getGiftOccasion(slug: string) {
  return giftOccasions.find((occasion) => occasion.slug === slug) ?? null;
}

export type GiftSet = { label: string; query: string };

export type GiftRecipient = {
  slug: string;
  label: string;
  // Instruments first, then accessories; each a catalog filter set (the catalog's own URL parameters).
  sets: readonly GiftSet[];
  // "Qué preguntarle al vendedor", for this kind of gift.
  questions: readonly string[];
  tip: string;
};

export const giftRecipients: readonly GiftRecipient[] = [
  {
    slug: "nino",
    label: "Un niño o niña",
    tip: "Para niños, el tamaño importa más que la marca: una guitarra 1/2 o 3/4, un ukelele o un teclado portátil son fáciles de cargar y de tocar.",
    sets: [
      { label: "Ukeleles", query: "category=strings&instrument_type=string_instrument&string_type=ukulele" },
      { label: "Teclados portátiles", query: "category=keyboards&instrument_type=keyboards&keyboard_type=portable" },
      { label: "Guitarras clásicas", query: "category=guitars&instrument_type=acoustic_guitar&acoustic_type=classical" },
      { label: "Percusión de mano", query: "category=percussion&instrument_type=hand_percussion" },
    ],
    questions: ["¿Qué medida tiene (1/2, 3/4 o completa)?", "¿Cuánto pesa?", "¿Incluye funda o estuche?"],
  },
  {
    slug: "principiante",
    label: "Alguien que empieza",
    tip: "Para empezar, mejor un instrumento cómodo y que afine bien que uno con muchas funciones. Revisa las guías antes de ir a verlo.",
    sets: [
      { label: "Guitarras", query: "category=guitars" },
      { label: "Teclados", query: "category=keyboards" },
      { label: "Ukeleles", query: "category=strings&instrument_type=string_instrument&string_type=ukulele" },
      { label: "Cajones", query: "category=percussion&instrument_type=hand_percussion&percussion_type=cajon" },
    ],
    questions: ["¿Afina bien y está calibrado?", "¿Qué incluye: funda, cable, fuente?", "¿Lo puedo probar antes de pagar?"],
  },
  {
    slug: "guitarrista",
    label: "Guitarrista",
    tip: "Si no sabes qué guitarra quiere, un pedal o un amplificador pequeño para practicar en casa casi nunca falla.",
    sets: [
      { label: "Pedales de efecto", query: "category=pedals" },
      { label: "Afinadores de pedal", query: "category=pedals&instrument_type=pedals&pedal_type=tuner" },
      { label: "Amplificadores de guitarra", query: "category=amplifiers&instrument_type=amplifiers&use_case=guitar" },
      { label: "Guitarras", query: "category=guitars" },
    ],
    questions: ["¿Qué fuente usa el pedal y la incluye?", "¿Funciona en todos sus modos?", "¿Lo puedo probar con mi guitarra?"],
  },
  {
    slug: "bajista",
    label: "Bajista",
    tip: "Un compresor, un afinador o un amplificador de práctica son regalos útiles para cualquier bajista.",
    sets: [
      { label: "Amplificadores de bajo", query: "category=amplifiers&instrument_type=amplifiers&use_case=bass" },
      { label: "Pedales compresores", query: "category=pedals&instrument_type=pedals&pedal_type=compressor" },
      { label: "Bajos", query: "category=basses" },
    ],
    questions: ["¿El amplificador tiene salida de audífonos?", "¿El bajo trastea en alguna cuerda?", "¿Incluye funda?"],
  },
  {
    slug: "baterista",
    label: "Baterista",
    tip: "Los platillos y el cajón son regalos que cualquier baterista usa. Una batería electrónica deja practicar sin molestar a los vecinos.",
    sets: [
      { label: "Platillos", query: "category=percussion&instrument_type=cymbals" },
      { label: "Cajones", query: "category=percussion&instrument_type=hand_percussion&percussion_type=cajon" },
      { label: "Baterías electrónicas", query: "category=percussion&instrument_type=drums&drum_type=electronic" },
    ],
    questions: ["¿El platillo tiene rajaduras o el agujero ovalado?", "¿Incluye herrajes y pedal?", "¿El módulo y todos los pads funcionan?"],
  },
  {
    slug: "tecladista",
    label: "Tecladista o pianista",
    tip: "Un controlador MIDI, unos audífonos o un amplificador de teclado son buenos regalos si ya tiene instrumento.",
    sets: [
      { label: "Teclados y pianos", query: "category=keyboards" },
      { label: "Controladores MIDI", query: "category=keyboards&instrument_type=keyboards&keyboard_type=midi_controller" },
      { label: "Audífonos", query: "category=audio&instrument_type=audio_gear&audio_type=headphones" },
      { label: "Amplificadores de teclado", query: "category=amplifiers&instrument_type=amplifiers&use_case=keyboard" },
    ],
    questions: ["¿Todas las teclas suenan parejo?", "¿Incluye fuente y pedal?", "¿Funciona por USB con computadora?"],
  },
  {
    slug: "cantante",
    label: "Cantante",
    tip: "Un buen micrófono dinámico dura años; si canta en vivo, un parlante o monitores in-ear hacen la diferencia.",
    sets: [
      { label: "Micrófonos dinámicos", query: "category=microphones&instrument_type=microphones&microphone_type=dynamic" },
      { label: "Parlantes", query: "category=audio&instrument_type=audio_gear&audio_type=pa_speaker" },
      { label: "Monitores in-ear", query: "category=audio&instrument_type=audio_gear&audio_type=in_ear" },
    ],
    questions: ["¿Es original? ¿Tiene número de serie?", "¿Incluye pinza y cable?", "¿Suena sin crujidos al moverlo?"],
  },
  {
    slug: "productor",
    label: "Quien graba o produce",
    tip: "Para grabar en casa: una interfaz, monitores, un micrófono de condensador y un controlador. Cualquiera de ellos suma.",
    sets: [
      { label: "Interfaces de audio", query: "category=audio&instrument_type=audio_interface" },
      { label: "Monitores de estudio", query: "category=audio&instrument_type=audio_gear&audio_type=studio_monitor" },
      { label: "Micrófonos de condensador", query: "category=microphones&instrument_type=microphones&microphone_type=condenser" },
      { label: "Controladores MIDI", query: "category=keyboards&instrument_type=keyboards&keyboard_type=midi_controller" },
    ],
    questions: ["¿Funciona en Windows y Mac?", "¿Incluye cables y fuente?", "¿Tiene la licencia del software que trae?"],
  },
  {
    slug: "andino",
    label: "Quien toca música andina",
    tip: "Un charango, una quena o una zampoña hechos a mano por un taller peruano son un regalo que se recuerda.",
    sets: [
      { label: "Charangos", query: "category=andean&instrument_type=andean_instrument&andean_type=charango" },
      { label: "Quenas", query: "category=andean&instrument_type=andean_instrument&andean_type=quena" },
      { label: "Zampoñas y sikus", query: "category=andean&instrument_type=andean_instrument&andean_type=zampona" },
      { label: "Todo lo andino", query: "category=andean" },
    ],
    questions: ["¿Quién lo hizo y en qué ciudad?", "¿De qué madera o caña es?", "¿En qué tono o temple está?"],
  },
];

export function getGiftRecipient(slug: string | undefined) {
  return giftRecipients.find((recipient) => recipient.slug === slug) ?? null;
}

export type GiftBudget = { slug: string; label: string; minPrice?: number; maxPrice?: number };

export const giftBudgets: readonly GiftBudget[] = [
  { slug: "hasta-200", label: "Hasta S/ 200", maxPrice: 200 },
  { slug: "hasta-500", label: "Hasta S/ 500", maxPrice: 500 },
  { slug: "hasta-1000", label: "Hasta S/ 1,000", maxPrice: 1000 },
  { slug: "hasta-2500", label: "Hasta S/ 2,500", maxPrice: 2500 },
  { slug: "mas-de-2500", label: "Más de S/ 2,500", minPrice: 2500 },
];

export function getGiftBudget(slug: string | undefined) {
  return giftBudgets.find((budget) => budget.slug === slug) ?? null;
}

// Asked of every gift, whoever it is for.
export const giftQuestions: readonly string[] = [
  "¿Lo puedo cambiar si no le queda o ya lo tenía? ¿Hasta cuándo?",
  "¿Me lo puedes guardar hasta la fecha si te adelanto una parte?",
  "¿Me das boleta o un comprobante?",
];

// A catalog query string ("category=guitars&max_price=500") as the catalog's own filters, parsed the way /listados
// parses its URL, so the page shows exactly what its "Ver todo" link opens.
export function filtersFromQuery(query: string): ListingFilters {
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const current = params[key];
    params[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  }
  return parseListingFilters(params);
}

// The set's filters within the budget. A set's own price limit is kept when it is tighter.
export function giftSetFilters(set: GiftSet, budget: GiftBudget | null): ListingFilters {
  const filters = filtersFromQuery(set.query);
  if (!budget) return filters;
  const maxPrice = budget.maxPrice === undefined ? filters.maxPrice : filters.maxPrice === undefined ? budget.maxPrice : Math.min(filters.maxPrice, budget.maxPrice);
  const minPrice = budget.minPrice === undefined ? filters.minPrice : Math.max(filters.minPrice ?? 0, budget.minPrice);
  return { ...filters, minPrice, maxPrice };
}

// The finder's own URL: /regalos[/ocasion]?para=<recipient>&presupuesto=<budget>.
export function giftFinderHref(occasion: string | null, recipient: string | null, budget: string | null) {
  const params = new URLSearchParams();
  if (recipient) params.set("para", recipient);
  if (budget) params.set("presupuesto", budget);
  const base = occasion ? `${GIFTS_PATH}/${occasion}` : GIFTS_PATH;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
