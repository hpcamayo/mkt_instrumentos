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
