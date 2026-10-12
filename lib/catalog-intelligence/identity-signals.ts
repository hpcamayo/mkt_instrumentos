// identity-signals: deterministic checks of the listing's own words against the catalog's top candidate. They cover
// the cases where catalog_match returns AUTO although the listing must not be auto-approved (catalog quality audit,
// docs/catalog-audit/jev-autofill-handoff.md). Each signal only keeps a listing out of automation; none rejects it.

export type IdentitySignal =
  | "copy_wording" // "réplica", "clon", "tipo", "estilo" … : the listing says it is not the named instrument
  | "category_mismatch" // the seller's category or type is not the catalog product's
  | "brand_mismatch" // the seller's brand is not the top candidate's manufacturer
  | "second_product" // two different catalog products explain different words of the same text
  | "missing_generation" // a later generation of the same line exists and the listing does not say which one
  | "number_mismatch"; // the top candidate's model carries a number (size, series) the listing never wrote

export type IdentityCheck = { signal: IdentitySignal; detail: string };

// The fields of a lookup row the checks read. CatalogLookupRow satisfies it.
export type SignalCandidate = { product_id: string; manufacturer: string; model: string; matched_text: string | null };

export type SignalTop = SignalCandidate & {
  // The catalog category mapped onto Laria's taxonomy (null: the product or its mapping is unknown).
  laria_category: string | null;
  laria_instrument_type: string | null;
};

// Accent-free, lower-case text. "Réplica" and "replica" are the same word.
export function foldText(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function compact(text: string) {
  return foldText(text).replace(/[^a-z0-9]/g, "");
}

function words(text: string) {
  return foldText(text).split(/[^a-z0-9]+/).filter(Boolean);
}

// The lookup misses these when "de" or an article precedes the brand ("réplica de Gibson …"), so they are read here.
const COPY_WORDS =
  /\b(replicas?|clon(es|ado|ada)?|clones?|copias?|imitacion(es)?|imitation|tipo|estilo|inspirad[ao]s?\s+en|copy|knock\s?off|fake)\b/;

// Generation markers: MkII, Mk 2, Gen 3, 3rd Gen, V2, II … (joined without spaces before matching).
const GENERATION = /^(mk|mark|gen|generation|generacion|v|series)?([ivx]{1,4}|\d{1,2})(st|nd|rd|th|a)?(gen|generation|generacion)?$/;

export function identitySignals(input: {
  listing: { title: string; brand: string; model: string; category: string; instrument_type: string };
  top: SignalTop | null; // the candidate catalog_match chose; null when it chose none
  candidates: SignalCandidate[]; // every candidate looked up, for the listing's identity and for its title
}): IdentityCheck[] {
  const { listing, top } = input;
  const identityText = `${listing.title} ${listing.brand} ${listing.model}`;
  const checks: IdentityCheck[] = [];

  const copy = foldText(`${listing.title} ${listing.model}`).match(COPY_WORDS);
  if (copy) checks.push({ signal: "copy_wording", detail: copy[0] });

  if (!top) return checks;

  if (!top.laria_category) {
    checks.push({ signal: "category_mismatch", detail: "catalog category unknown" });
  } else if (top.laria_category !== listing.category || (top.laria_instrument_type && top.laria_instrument_type !== listing.instrument_type)) {
    checks.push({
      signal: "category_mismatch",
      detail: `listing ${listing.category}/${listing.instrument_type || "-"}, catalog ${top.laria_category}/${top.laria_instrument_type ?? "-"}`,
    });
  }

  const brand = compact(listing.brand);
  const manufacturer = compact(top.manufacturer);
  if (brand && manufacturer && !brand.includes(manufacturer) && !manufacturer.includes(brand)) {
    checks.push({ signal: "brand_mismatch", detail: `${listing.brand} vs ${top.manufacturer}` });
  }

  const others = dedupe(input.candidates).filter((item) => item.product_id !== top.product_id);
  const second = secondProduct(top, others, [top, ...input.candidates], [listing.title, `${listing.brand} ${listing.model}`]);
  if (second) checks.push({ signal: "second_product", detail: `${top.manufacturer} ${top.model} + ${second.manufacturer} ${second.model}` });

  const listingWords = new Set(words(identityText));
  const topWords = words(top.model);
  for (const other of others) {
    if (compact(other.manufacturer) !== manufacturer) continue;
    const otherWords = words(other.model);
    if (!topWords.every((word) => otherWords.includes(word))) continue;
    const extra = otherWords.filter((word) => !topWords.includes(word));
    if (extra.length === 0 || !GENERATION.test(extra.join("")) || extra.some((word) => listingWords.has(word))) continue;
    checks.push({ signal: "missing_generation", detail: `${top.model} or ${other.model}` });
    break;
  }

  const listingNumbers = new Set(foldText(identityText).match(/\d+/g) ?? []);
  const missingNumbers = (foldText(top.model).match(/\d+/g) ?? []).filter((number) => !listingNumbers.has(number));
  if (missingNumbers.length) checks.push({ signal: "number_mismatch", detail: `${top.model}: ${missingNumbers.join(", ")} not in listing` });

  return checks;
}

// Two products whose matched words sit side by side, without overlapping, in the same text ("boss ds1 shure sm57").
// Overlapping spans ("Fender Player Stratocaster" inside "Fender Player Stratocaster HSS") are one product. A product
// may have matched different words in the identity lookup and in the title lookup, so every matched text counts.
function secondProduct(top: SignalCandidate, others: SignalCandidate[], rows: SignalCandidate[], texts: string[]) {
  const needles = new Map<string, string[]>();
  for (const row of rows) {
    const list = needles.get(row.product_id) ?? [];
    for (const needle of [compact(row.matched_text ?? ""), compact(row.model)]) {
      if (needle.length >= 3 && !list.includes(needle)) list.push(needle);
    }
    needles.set(row.product_id, list);
  }
  for (const text of texts) {
    const haystack = compact(text);
    const topSpan = span(haystack, needles.get(top.product_id) ?? []);
    if (!topSpan) continue;
    for (const other of others) {
      const otherSpan = span(haystack, needles.get(other.product_id) ?? []);
      if (otherSpan && (otherSpan[1] <= topSpan[0] || otherSpan[0] >= topSpan[1])) return other;
    }
  }
  return null;
}

function span(haystack: string, needles: string[]): [number, number] | null {
  for (const needle of needles) {
    const at = haystack.indexOf(needle);
    if (at >= 0) return [at, at + needle.length];
  }
  return null;
}

function dedupe(candidates: SignalCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((item) => (seen.has(item.product_id) ? false : (seen.add(item.product_id), true)));
}
