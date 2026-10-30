import type { Metadata } from "next";
import { CompareListings } from "@/components/compare-listings";
import { NOINDEX_FOLLOW_ROBOTS } from "@/lib/site";

export const metadata: Metadata = { title: "Comparar instrumentos", robots: NOINDEX_FOLLOW_ROBOTS };
export default function ComparePage() {
  return <><noscript><p className="p-4 t-body text-ink">Activa JavaScript para comparar instrumentos en este dispositivo.</p></noscript><CompareListings /></>;
}
