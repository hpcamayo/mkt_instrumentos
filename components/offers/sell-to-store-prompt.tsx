import Link from "next/link";
import { getCategoryLabel } from "@/lib/listings";
import { sellingDb } from "@/lib/selling-tools";

// sell-02 on the sell page: "¿Prefieres vender ya?" only when verified stores of the person's region really buy used
// gear, with the real count and categories. No count, no card.
export async function SellToStorePrompt({ supabase, region }: { supabase: unknown; region: string | null | undefined }) {
  if (!supabase || !region) return null;
  const { data } = await sellingDb(supabase).rpc("count_trade_stores_by_category", { p_region: region });
  const counts = Object.entries((data ?? {}) as Record<string, number>).filter(([, count]) => count > 0);
  if (!counts.length) return null;
  return (
    <aside aria-labelledby="vender-a-tienda" className="grid gap-1 rounded-panel border border-subtle bg-surface p-4">
      <h2 id="vender-a-tienda" className="t-ui font-semibold text-ink">¿Prefieres vender ya?</h2>
      <p className="t-ui text-ink-2">
        En {region}, tiendas verificadas compran usados: {counts.map(([category]) => getCategoryLabel(category).toLowerCase()).join(", ")}. Te ofertan en 24 horas; tú eliges una, o sigues publicando.
      </p>
      <Link href="/mi-cuenta/equipo/ofertas/nueva" className="link w-fit t-ui font-semibold">Pedir ofertas a tiendas</Link>
    </aside>
  );
}
