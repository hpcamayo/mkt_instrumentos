// sell-07 on a card: the seller's word on the price, in a few letters beside it. Nothing when not said.
export function PriceModeMark({ mode }: { mode: string | null | undefined }) {
  if (mode !== "fixed" && mode !== "negotiable") return null;
  return <span className="t-meta font-semibold text-ink-2">{mode === "negotiable" ? "Conversable" : "Precio fijo"}</span>;
}
