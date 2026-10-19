export const peruRegions = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
] as const;

export const citySuggestions = [
  "Lima",
  "Arequipa",
  "Trujillo",
  "Chiclayo",
  "Piura",
  "Cusco",
  "Iquitos",
  "Huancayo",
  "Tacna",
  "Pucallpa",
  "Juliaca",
  "Ayacucho",
  "Cajamarca",
  "Huaraz",
  "Ica",
  "Moquegua",
  "Tarapoto",
  "Tumbes",
  "Chimbote",
  "Callao",
] as const;

export type PeruRegion = (typeof peruRegions)[number];

export function normalizePeruRegion(value: string) {
  const normalized = normalizeForCompare(value);

  return (
    peruRegions.find((region) => normalizeForCompare(region) === normalized) ??
    null
  );
}

export function isValidPeruRegion(value: string) {
  return normalizePeruRegion(value) !== null;
}

function normalizeForCompare(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// FIND 05 (Effortless Laria): the location filter lists the cities that really have listings, grouped by zone, each
// zone with a "Todo …" option. A city's zone comes from its listing's region (normalized), or from the city itself
// when the region is missing or reads "Peru".
export type LocationZone = { key: string; label: string; regions: readonly PeruRegion[] };

export const locationZones: readonly LocationZone[] = [
  { key: "lima", label: "Lima y Callao", regions: ["Lima", "Callao"] },
  { key: "norte", label: "Norte", regions: ["Tumbes", "Piura", "Lambayeque", "La Libertad", "Cajamarca", "Áncash", "Amazonas"] },
  { key: "centro", label: "Centro", regions: ["Junín", "Pasco", "Huánuco", "Huancavelica", "Ica", "Ayacucho"] },
  { key: "sur", label: "Sur", regions: ["Arequipa", "Moquegua", "Tacna", "Cusco", "Puno", "Apurímac"] },
  { key: "oriente", label: "Oriente", regions: ["Loreto", "Ucayali", "San Martín", "Madre de Dios"] },
];

// Cities whose region is not their own name (the region is otherwise read from the city).
const cityRegions: Readonly<Record<string, PeruRegion>> = {
  trujillo: "La Libertad", chiclayo: "Lambayeque", iquitos: "Loreto", huancayo: "Junín", pucallpa: "Ucayali",
  juliaca: "Puno", huaraz: "Áncash", tarapoto: "San Martín", chimbote: "Áncash", "puerto maldonado": "Madre de Dios",
  chachapoyas: "Amazonas", "cerro de pasco": "Pasco", "la merced": "Junín", "jauja": "Junín", "tarma": "Junín",
  "chincha": "Ica", "pisco": "Ica", "nazca": "Ica", "sullana": "Piura", "talara": "Piura", "ilo": "Moquegua",
  "abancay": "Apurímac", "andahuaylas": "Apurímac", "huamanga": "Ayacucho", "moyobamba": "San Martín",
};

export function regionOfLocation(city: string, region?: string | null): PeruRegion | null {
  const fromRegion = region ? normalizePeruRegion(region) : null;
  if (fromRegion) return fromRegion;
  return cityRegions[normalizeForCompare(city)] ?? normalizePeruRegion(city);
}

export function zoneOfLocation(city: string, region?: string | null): LocationZone | null {
  const found = regionOfLocation(city, region);
  return found ? (locationZones.find((zone) => zone.regions.includes(found)) ?? null) : null;
}
