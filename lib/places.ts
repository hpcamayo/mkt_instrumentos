import { regionOfLocation, type PeruRegion } from "@/lib/location";

// buy-08 "Ver en mapa": where an approximate area sits. Laria stores no coordinates for listings and none for a store
// that has not placed its pin, so the map draws an area around the place they name: a Lima district for a store
// (stores.district), the city for everyone else, and the region's capital when the city is unknown. The centres are
// rounded public coordinates; the radius is wide enough that the area never reads as an address.
// Pure, with no imports beyond lib/location.ts, so the browser, the server and the tests share it.

export type Place = { key: string; label: string; latitude: number; longitude: number; radiusKm: number };

type Entry = readonly [name: string, latitude: number, longitude: number];

// Lima and Callao districts that stores write in their profile (and their usual short names).
const LIMA_DISTRICTS: readonly Entry[] = [
  ["Ate", -12.026, -76.919], ["Barranco", -12.149, -77.021], ["Breña", -12.059, -77.05], ["Carabayllo", -11.85, -77.03],
  ["Cercado de Lima", -12.046, -77.043], ["Chorrillos", -12.169, -77.016], ["Comas", -11.933, -77.05],
  ["El Agustino", -12.043, -76.997], ["Independencia", -11.992, -77.046], ["Jesús María", -12.077, -77.044],
  ["La Molina", -12.087, -76.935], ["La Victoria", -12.073, -77.017], ["Lince", -12.084, -77.034],
  ["Los Olivos", -11.97, -77.072], ["Lurín", -12.274, -76.87], ["Magdalena del Mar", -12.091, -77.071],
  ["Miraflores", -12.121, -77.03], ["Pueblo Libre", -12.076, -77.064], ["Puente Piedra", -11.866, -77.077],
  ["Rímac", -12.028, -77.033], ["San Borja", -12.108, -76.999], ["San Isidro", -12.098, -77.037],
  ["San Juan de Lurigancho", -11.985, -77.005], ["San Juan de Miraflores", -12.157, -76.971],
  ["San Luis", -12.076, -76.995], ["San Martín de Porres", -12.0, -77.083], ["San Miguel", -12.077, -77.092],
  ["Santa Anita", -12.044, -76.971], ["Santiago de Surco", -12.146, -76.992], ["Surquillo", -12.113, -77.018],
  ["Villa El Salvador", -12.213, -76.937], ["Villa María del Triunfo", -12.165, -76.938],
  ["Bellavista", -12.062, -77.128], ["La Perla", -12.069, -77.121],
];
const DISTRICT_ALIASES: Readonly<Record<string, string>> = {
  surco: "Santiago de Surco", magdalena: "Magdalena del Mar", "lima cercado": "Cercado de Lima", "cercado": "Cercado de Lima",
  sjl: "San Juan de Lurigancho", sjm: "San Juan de Miraflores", smp: "San Martín de Porres", ves: "Villa El Salvador",
};

// Cities (lib/location.ts citySuggestions and the regions' capitals). Lima's centre is the middle of the metropolitan
// area, not the Cercado, so its wide area does not sit on one district.
const CITIES: readonly Entry[] = [
  ["Lima", -12.08, -77.035], ["Callao", -12.057, -77.118], ["Arequipa", -16.409, -71.537], ["Trujillo", -8.112, -79.029],
  ["Chiclayo", -6.771, -79.841], ["Piura", -5.195, -80.633], ["Cusco", -13.532, -71.968], ["Iquitos", -3.744, -73.252],
  ["Huancayo", -12.065, -75.205], ["Tacna", -18.015, -70.254], ["Pucallpa", -8.379, -74.554], ["Juliaca", -15.5, -70.133],
  ["Ayacucho", -13.159, -74.224], ["Cajamarca", -7.164, -78.5], ["Huaraz", -9.528, -77.528], ["Ica", -14.068, -75.729],
  ["Moquegua", -17.196, -70.935], ["Tarapoto", -6.488, -76.36], ["Tumbes", -3.567, -80.452], ["Chimbote", -9.075, -78.594],
  ["Puno", -15.84, -70.022], ["Huánuco", -9.931, -76.242], ["Chachapoyas", -6.232, -77.869], ["Abancay", -13.634, -72.881],
  ["Huancavelica", -12.786, -74.976], ["Cerro de Pasco", -10.668, -76.257], ["Puerto Maldonado", -12.593, -69.189],
  ["Moyobamba", -6.034, -76.972], ["Sullana", -4.904, -80.685], ["Chincha", -13.418, -76.132], ["Pisco", -13.71, -76.203],
  ["Ilo", -17.646, -71.345], ["Jauja", -11.775, -75.5], ["Tarma", -11.419, -75.69], ["Huamanga", -13.159, -74.224],
];
const CITY_ALIASES: Readonly<Record<string, string>> = { "lima metropolitana": "Lima", "cusco ciudad": "Cusco", cuzco: "Cusco" };

const REGION_CAPITALS: Readonly<Record<PeruRegion, string>> = {
  Amazonas: "Chachapoyas", Áncash: "Huaraz", Apurímac: "Abancay", Arequipa: "Arequipa", Ayacucho: "Ayacucho",
  Cajamarca: "Cajamarca", Callao: "Callao", Cusco: "Cusco", Huancavelica: "Huancavelica", Huánuco: "Huánuco", Ica: "Ica",
  Junín: "Huancayo", "La Libertad": "Trujillo", Lambayeque: "Chiclayo", Lima: "Lima", Loreto: "Iquitos",
  "Madre de Dios": "Puerto Maldonado", Moquegua: "Moquegua", Pasco: "Cerro de Pasco", Piura: "Piura", Puno: "Puno",
  "San Martín": "Moyobamba", Tacna: "Tacna", Tumbes: "Tumbes", Ucayali: "Pucallpa",
};

// Radius of each kind of area, in kilometres.
export const AREA_RADIUS_KM = { district: 1.5, city: 4, lima: 9, region: 30 } as const;

function normalize(value: string) {
  return value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

function index(entries: readonly Entry[], aliases: Readonly<Record<string, string>>) {
  const map = new Map(entries.map((entry) => [normalize(entry[0]), entry] as const));
  for (const [alias, name] of Object.entries(aliases)) map.set(alias, map.get(normalize(name))!);
  return map;
}

const districts = index(LIMA_DISTRICTS, DISTRICT_ALIASES);
const cities = index(CITIES, CITY_ALIASES);

function cityEntry(city: string | null | undefined) {
  return city ? cities.get(normalize(city)) ?? null : null;
}

// A city's area, or its region capital's (wider) when the city is not in the list. Null when neither is known.
export function cityPlace(city: string | null | undefined, region?: string | null): Place | null {
  const known = cityEntry(city);
  if (known) {
    const [name, latitude, longitude] = known;
    const radiusKm = name === "Lima" ? AREA_RADIUS_KM.lima : AREA_RADIUS_KM.city;
    return { key: `ciudad:${normalize(name)}`, label: name, latitude, longitude, radiusKm };
  }
  const found = regionOfLocation(city ?? "", region);
  const capital = found ? cityEntry(REGION_CAPITALS[found]) : null;
  if (!found || !capital) return null;
  return { key: `region:${normalize(found)}`, label: found, latitude: capital[1], longitude: capital[2], radiusKm: AREA_RADIUS_KM.region };
}

// A Lima or Callao district's area, for a store that names one; otherwise its city's.
export function districtPlace(district: string | null | undefined, city: string | null | undefined, region?: string | null): Place | null {
  const limaArea = !city || ["lima", "callao"].includes(normalize(city)) || ["lima", "callao"].includes(normalize(region ?? ""));
  const known = district && limaArea ? districts.get(normalize(district)) : null;
  if (known) {
    const [name, latitude, longitude] = known;
    return { key: `distrito:${normalize(name)}`, label: `${name}, Lima`, latitude, longitude, radiusKm: AREA_RADIUS_KM.district };
  }
  return cityPlace(city, region);
}

// Where a map with nothing on it opens, and what it may show: Peru.
export const PERU_CENTER = { latitude: -9.19, longitude: -75.015 } as const;
export const PERU_BOUNDS = { south: -18.5, west: -81.5, north: 0.1, east: -68.5 } as const;

export function isInPeru(latitude: number, longitude: number) {
  return latitude >= PERU_BOUNDS.south && latitude <= PERU_BOUNDS.north && longitude >= PERU_BOUNDS.west && longitude <= PERU_BOUNDS.east;
}
