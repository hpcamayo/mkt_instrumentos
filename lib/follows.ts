// save-12: following a store or a brand. New arrivals appear in "Para ti" and, if chosen, in a weekly e-mail.
export type AccountFollow = {
  id: string;
  kind: "store" | "brand";
  store_id: string | null;
  store_name: string | null;
  store_slug: string | null;
  brand: string | null;
  created_at: string;
};

export type FollowedArrival = {
  id: string;
  slug: string;
  title: string;
  price_pen: number | null;
  city: string | null;
  condition: string | null;
  published_at: string;
  reason: "store" | "brand";
  reason_label: string | null;
  image_url: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const optionalText = (value: unknown) => value === null || value === undefined || typeof value === "string";

export function parseAccountFollows(value: unknown): AccountFollow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is AccountFollow => isRecord(row) && typeof row.id === "string" && (row.kind === "store" || row.kind === "brand")
    && optionalText(row.store_id) && optionalText(row.store_name) && optionalText(row.store_slug) && optionalText(row.brand) && typeof row.created_at === "string");
}

export function parseFollowedArrivals(value: unknown): FollowedArrival[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is FollowedArrival => isRecord(row) && typeof row.id === "string" && typeof row.slug === "string" && typeof row.title === "string"
    && (row.price_pen === null || typeof row.price_pen === "number") && (row.reason === "store" || row.reason === "brand") && optionalText(row.reason_label) && optionalText(row.image_url));
}

export function followLabel(follow: Pick<AccountFollow, "kind" | "store_name" | "brand">) {
  return follow.kind === "store" ? follow.store_name ?? "Tienda" : follow.brand ?? "Marca";
}

// Why an arrival is shown ("Porque sigues Fender").
export function arrivalReason(arrival: Pick<FollowedArrival, "reason_label">) {
  return arrival.reason_label ? `Porque sigues ${arrival.reason_label}` : "De lo que sigues";
}
