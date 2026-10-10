import { MAX_LISTING_PHOTOS, MIN_LISTING_PHOTOS } from "@/lib/listing-submission";
import { getConditionLabel } from "@/lib/listings";

// The sell form's copy and checks (docs/ux-redesign/ux-5-selling.md). Pure, so the form and the tests share them.
// The rules themselves (photo count, 40-character description, whole soles, a Peruvian region) are today's.

export const PHOTO_GUIDANCE = [
  "Frente y reverso completos",
  "Detalles y desgaste de cerca",
  "Accesorios incluidos",
  "Luz natural, sin filtros",
] as const;

// Help text for the three stored grades (UX-5 S3, provisional copy; F2, a gear-specific scale, is separate).
const CONDITION_HELP: Record<string, string> = {
  Nuevo: "Sin uso, con todo lo que trae de fábrica.",
  "Usado - buen estado": "Funciona bien; puede tener marcas leves de uso.",
  "Usado - con detalles": "Desgaste visible o algo por reparar. Cuéntalo en la descripción y muéstralo en las fotos.",
};

export function conditionChoices(conditions: readonly string[]) {
  return conditions.map((value) => ({ value, label: getConditionLabel(value), description: CONDITION_HELP[value] ?? "" }));
}

export const DESCRIPTION_MIN = 40;

export type SellDraft = {
  photoCount: number;
  category: string;
  instrumentType: string;
  brand: string;
  model: string;
  title: string;
  condition: string;
  price: string;
  priceValue: number | null;
  city: string;
  region: string;
  regionValue: string | null;
  description: string;
  acceptedRules: boolean;
};

export type SellField =
  | "photos"
  | "category"
  | "instrument_type"
  | "brand"
  | "model"
  | "title"
  | "condition"
  | "price_pen"
  | "city"
  | "region"
  | "description"
  | "marketplace_rules";

export type SellError = { field: SellField; message: string };

// Errors in the order the fields appear on the page, so the summary reads top to bottom.
export function validateSellDraft(draft: SellDraft): SellError[] {
  const errors: SellError[] = [];
  const add = (field: SellField, message: string) => errors.push({ field, message });
  if (draft.photoCount < MIN_LISTING_PHOTOS) add("photos", `Agrega al menos ${MIN_LISTING_PHOTOS} fotos.`);
  if (draft.photoCount > MAX_LISTING_PHOTOS) add("photos", `Puedes subir hasta ${MAX_LISTING_PHOTOS} fotos.`);
  if (!draft.category) add("category", "Elige una categoría.");
  if (draft.category && !draft.instrumentType) add("instrument_type", "Elige el tipo de instrumento.");
  if (!draft.brand) add("brand", "Escribe la marca.");
  if (!draft.model) add("model", "Escribe el modelo.");
  if (!draft.title) add("title", "Escribe un título.");
  if (!draft.condition) add("condition", "Elige la condición.");
  if (!draft.price) add("price_pen", "Escribe el precio en soles.");
  else if (draft.priceValue === null) add("price_pen", "Escribe el precio en soles enteros, solo con números.");
  if (!draft.city) add("city", "Escribe la ciudad.");
  if (!draft.region) add("region", "Escribe la región.");
  else if (!draft.regionValue) add("region", "Elige una región de la lista.");
  if (draft.description.length < DESCRIPTION_MIN) {
    add("description", draft.description
      ? `Escribe al menos ${DESCRIPTION_MIN} caracteres; llevas ${draft.description.length}.`
      : `Escribe una descripción de al menos ${DESCRIPTION_MIN} caracteres.`);
  }
  if (!draft.acceptedRules) add("marketplace_rules", "Acepta los términos y reglas para publicar.");
  return errors;
}

export function errorSummaryTitle(count: number) {
  return count === 1 ? "Revisa 1 dato antes de publicar" : `Revisa ${count} datos antes de publicar`;
}

// What the seller reads after sending: a verified active store publishes directly, everything else goes to review
// and the seller gets an email (decisions.md § Email notices in context; the copy never promises how fast).
export function sellConfirmation(direct: boolean) {
  return direct
    ? { message: "Tu publicación ya está en el catálogo.", next: "Ya aparece en la búsqueda y en la página de tu tienda." }
    : {
        message: "Publicación enviada. Un administrador la revisará antes de hacerla pública.",
        next: "Te avisaremos por correo cuando se apruebe o si no puede publicarse. Mientras tanto la verás como «En revisión».",
      };
}
