// The sell form's guidance (Effortless Laria, selling batch; docs/ux-effortless/selling.md). Pure, so the form and the
// tests share it: shot lists per category (POST 06), the title written from brand and model (POST 07), description
// starters (POST 09) and the hints that prevent a rejection (POST 11).

export type Shot = { id: string; label: string; hint: string };

const FRONT: Shot = { id: "frente", label: "Frente", hint: "El instrumento completo, de frente." };
const BACK: Shot = { id: "reverso", label: "Reverso", hint: "Completo, por detrás." };
const WEAR: Shot = { id: "desgaste", label: "Detalles y desgaste", hint: "De cerca: golpes, rayones o marcas de uso." };
const EXTRAS: Shot = { id: "accesorios", label: "Estuche y accesorios", hint: "Todo lo que incluye la venta." };

// Shots per marketplace category; anything else uses the general list. The first two cover the spec's expected
// minimum (front and back).
const SHOTS: Record<string, Shot[]> = {
  guitars: [FRONT, BACK, { id: "clavijero", label: "Clavijero y número de serie", hint: "La pala y el número de serie legible." }, { id: "trastes", label: "Trastes", hint: "El diapasón de cerca, para ver el desgaste." }, { id: "electronica", label: "Electrónica", hint: "Pastillas, perillas y jack." }, WEAR, EXTRAS],
  basses: [FRONT, BACK, { id: "clavijero", label: "Clavijero y número de serie", hint: "La pala y el número de serie legible." }, { id: "trastes", label: "Trastes", hint: "El diapasón de cerca." }, { id: "electronica", label: "Electrónica", hint: "Pastillas, perillas y jack." }, WEAR, EXTRAS],
  keyboards: [FRONT, { id: "panel", label: "Panel y pantalla", hint: "Encendido, con la pantalla visible." }, { id: "teclas", label: "Teclas", hint: "El teclado de cerca." }, { id: "conexiones", label: "Conexiones", hint: "La parte trasera con sus entradas y salidas." }, WEAR, EXTRAS],
  percussion: [FRONT, { id: "parches", label: "Parches", hint: "Los parches o platillos de cerca." }, { id: "herrajes", label: "Herrajes", hint: "Soportes, tensores y aros." }, WEAR, EXTRAS],
  winds: [FRONT, BACK, { id: "llaves", label: "Llaves y mecanismo", hint: "Las llaves y zapatillas de cerca." }, { id: "serie", label: "Número de serie", hint: "Legible." }, WEAR, EXTRAS],
  strings: [FRONT, BACK, { id: "clavijero", label: "Clavijero", hint: "La cabeza y las clavijas." }, WEAR, EXTRAS],
  pedals: [{ id: "arriba", label: "Vista superior", hint: "Perillas y switch, enfocados." }, { id: "conexiones", label: "Conexiones", hint: "Entradas, salidas y alimentación." }, { id: "base", label: "Base", hint: "La tapa inferior, con el número de serie si tiene." }, WEAR, EXTRAS],
  amplifiers: [FRONT, BACK, { id: "panel", label: "Panel de control", hint: "Perillas y entradas, enfocadas." }, { id: "parlante", label: "Parlante", hint: "Si se puede ver, el cono." }, WEAR, EXTRAS],
  microphones: [FRONT, { id: "capsula", label: "Cápsula o rejilla", hint: "De cerca." }, { id: "conector", label: "Conector", hint: "XLR o USB." }, WEAR, EXTRAS],
  audio: [FRONT, BACK, { id: "conexiones", label: "Conexiones", hint: "Entradas y salidas." }, WEAR, EXTRAS],
  andean: [FRONT, BACK, { id: "detalle", label: "Clavijas, agujeros o parche", hint: "Lo que suena, de cerca: clavijas y cuerdas, agujeros y bisel, o parche y amarres." }, { id: "firma", label: "Firma o sello del luthier", hint: "Si tiene, legible." }, WEAR, EXTRAS],
};

const GENERAL_SHOTS: Shot[] = [FRONT, BACK, WEAR, EXTRAS];

export function shotList(category: string): Shot[] {
  return SHOTS[category] ?? GENERAL_SHOTS;
}

// POST 07: the title is brand and model until the seller writes their own.
export function titleFromBrandModel(brand: string, model: string) {
  const parts = [brand.trim(), model.trim()].filter(Boolean);
  // "Fender" + "Fender Stratocaster" should not read "Fender Fender Stratocaster".
  if (parts.length === 2 && parts[1].toLowerCase().startsWith(parts[0].toLowerCase())) return parts[1];
  return parts.join(" ").replace(/\s+/g, " ");
}

// POST 09: tappable starters. Each adds a line the seller completes; nothing is sent until they write it.
const COMMON_STARTERS = ["Incluye estuche", "Modificaciones: ", "Fallas conocidas: ", "Año de compra: ", "Motivo de venta: "];
const STARTERS_BY_TYPE: Record<string, string[]> = {
  electric_guitar: ["Cuerdas cambiadas hace ", "Calibración reciente", "Trastes al "],
  acoustic_guitar: ["Cuerdas cambiadas hace ", "Sin rajaduras", "Ecualizador: "],
  bass: ["Cuerdas cambiadas hace ", "Calibración reciente"],
  amplifiers: ["Potencia: ", "Funciona en todos los canales", "Válvulas cambiadas hace "],
  pedals: ["Funciona con fuente de 9 V", "Incluye caja original"],
  keyboards: ["Todas las teclas funcionan", "Incluye fuente y pedal"],
  drums: ["Medidas de los cascos: ", "Parches cambiados hace "],
  cymbals: ["Medida: ", "Sin rajaduras ni ojos ovalados"],
  microphones: ["Incluye pinza y cable", "Patrón polar: "],
  audio_interface: ["Probada en Windows y Mac", "Incluye cable USB"],
  andean_instrument: ["Hecho por ", "Afinación: ", "Madera o caña: "],
};

export function descriptionStarters(instrumentType: string) {
  return [...(STARTERS_BY_TYPE[instrumentType] ?? []), ...COMMON_STARTERS];
}

// Adds a starter on its own line, once.
export function addStarter(description: string, starter: string) {
  if (description.includes(starter.trim())) return description;
  const base = description.replace(/\s+$/, "");
  return base ? `${base}\n${starter}` : starter;
}

// POST 11: what usually gets a listing rejected, said while the seller can still fix it. Advice only; publishing is
// never blocked by a hint.
export type SellHint = { field: "photos" | "title" | "price_pen" | "description"; message: string };

const PHONE = /(?:\+?51[\s-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/;
const CONTACT = /(?:https?:\/\/|www\.|@[a-z0-9_.]{3,}|[^\s@]+@[^\s@]+\.[a-z]{2,})/i;

export function sellHints(input: { photoCount: number; shots: string[]; title: string; description: string; price: number | null }): SellHint[] {
  const hints: SellHint[] = [];
  if (input.photoCount === 2 && !(input.shots.includes("frente") && input.shots.includes("reverso"))) {
    hints.push({ field: "photos", message: "Con frente, reverso y un detalle de cerca recibes menos preguntas y la revisión es más rápida." });
  }
  if (PHONE.test(input.title) || PHONE.test(input.description)) {
    hints.push({ field: "description", message: "No hace falta escribir tu número: el botón de WhatsApp ya lo hace, y los teléfonos en el texto se rechazan." });
  }
  if (CONTACT.test(input.title) || CONTACT.test(input.description)) {
    hints.push({ field: "description", message: "Quita enlaces, correos o usuarios de redes: los compradores te escriben por WhatsApp." });
  }
  const letters = input.title.replace(/[^a-záéíóúñü]/gi, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) {
    hints.push({ field: "title", message: "Escribe el título sin todo en mayúsculas; se lee mejor y se ve más confiable." });
  }
  if (input.price !== null && input.price > 0 && input.price < 20) {
    hints.push({ field: "price_pen", message: `¿S/ ${input.price} es el precio real? Las publicaciones con precios simbólicos se rechazan.` });
  }
  return hints;
}
