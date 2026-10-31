// Well-known public places for meeting a Particular seller (safe-03 «Encuentro seguro»). A short, hand-picked list of
// large shopping centers with security staff and people around, by city; the meetup sheet shows them next to the
// stores that offer themselves as «Punto seguro Laria». Laria has no agreement with any of these places and checks
// nothing about a meeting; the sheet says so. Each one opens a map search, never a fixed address that could go stale.
// FD-deal-trust-17: names to be confirmed by someone in Lima before launch (docs/feature-ideas/deal-trust.md).

export type MeetupPlace = { name: string; area: string };

const PLACES: Record<string, MeetupPlace[]> = {
  lima: [
    { name: "Larcomar", area: "Miraflores" },
    { name: "Jockey Plaza", area: "Santiago de Surco" },
    { name: "Real Plaza Salaverry", area: "Jesús María" },
    { name: "Plaza San Miguel", area: "San Miguel" },
    { name: "Open Plaza Angamos", area: "Surquillo" },
    { name: "Real Plaza Centro Cívico", area: "Cercado de Lima" },
    { name: "Plaza Norte", area: "Independencia" },
    { name: "MegaPlaza", area: "Independencia" },
    { name: "Mall del Sur", area: "San Juan de Miraflores" },
    { name: "Real Plaza Puruchuco", area: "Ate" },
    { name: "Mall Aventura Santa Anita", area: "Santa Anita" },
  ],
  callao: [{ name: "Minka", area: "Callao" }],
  arequipa: [
    { name: "Mall Aventura Porongoche", area: "Paucarpata" },
    { name: "Real Plaza Arequipa", area: "Cayma" },
    { name: "Parque Lambramani", area: "Arequipa" },
  ],
  trujillo: [
    { name: "Mall Aventura Trujillo", area: "Trujillo" },
    { name: "Real Plaza Trujillo", area: "Trujillo" },
  ],
  chiclayo: [
    { name: "Real Plaza Chiclayo", area: "Chiclayo" },
    { name: "Open Plaza Chiclayo", area: "Chiclayo" },
  ],
  piura: [
    { name: "Open Plaza Piura", area: "Piura" },
    { name: "Real Plaza Piura", area: "Piura" },
  ],
  cusco: [{ name: "Real Plaza Cusco", area: "Cusco" }],
  huancayo: [
    { name: "Real Plaza Huancayo", area: "Huancayo" },
    { name: "Open Plaza Huancayo", area: "Huancayo" },
  ],
};

function fold(value: string) {
  return value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// The places for a publication's city; a city we have no list for gets none (the sheet then shows the police station
// search and the stores only).
export function meetupPlacesFor(city: string): MeetupPlace[] {
  return PLACES[fold(city)] ?? [];
}

export function mapSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function placeQuery(place: MeetupPlace, city: string) {
  return [place.name, place.area, city].filter((part, index, all) => part && all.indexOf(part) === index).join(", ");
}

export function policeStationQuery(city: string) {
  return `comisaría ${city}`.trim();
}
