import Link from "next/link";
import { Gift, Hammer } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestReads } from "@/lib/supabase/public-read-client";
import { GIFTS_PATH } from "@/lib/discovery/gift-finder";
import { GIFT_EXCHANGE_DISCLAIMER, MAKERS_PATH, MAKER_DISCLAIMER, MAKER_KIND_LABELS, giftExchangeLabel, handmadeLabel, type MakerKind } from "@/lib/discovery/makers";

type MakerProfile = { kind: MakerKind; craft_city: string; story: string | null; since_year: number | null };

// disc-04 and buy-05 on the store page: the maker's story ("Taller desde 1998 · Hecho a mano en Ayacucho") and the
// store's gift exchange policy. Nothing when the store has neither, or a read fails (both are extras).
export async function StoreDiscoverySection({ storeId }: { storeId: string }) {
  const db = getRequestReads().supabase as unknown as SupabaseClient | null;
  if (!db) return null;
  const [maker, gift] = await Promise.all([
    db.rpc("get_store_maker_profile", { p_store_id: storeId }),
    db.from("store_gift_policies").select("exchange_days,note").eq("store_id", storeId).maybeSingle(),
  ]);
  const profile = !maker.error && maker.data && typeof maker.data === "object" ? (maker.data as MakerProfile) : null;
  const policy = !gift.error && gift.data ? (gift.data as { exchange_days: number; note: string | null }) : null;
  if (!profile && !policy) return null;
  return (
    <section aria-labelledby="taller-tienda" className="grid gap-4 rounded-panel border border-subtle p-4">
      <h2 id="taller-tienda" className="sr-only">Taller y regalos</h2>
      {profile ? (
        <div className="grid gap-1.5">
          <p className="t-micro text-ink-2">{MAKER_KIND_LABELS[profile.kind]}{profile.since_year ? ` desde ${profile.since_year}` : ""}</p>
          <p className="inline-flex items-center gap-1.5 t-ui font-semibold text-ink"><Hammer aria-hidden className="h-4 w-4" />{handmadeLabel(profile)}</p>
          {profile.story ? <p className="max-w-[68ch] whitespace-pre-line t-ui text-ink">{profile.story}</p> : null}
          <p className="t-meta">{MAKER_DISCLAIMER} <Link href={MAKERS_PATH} className="link">Más talleres en Hecho en Perú</Link></p>
        </div>
      ) : null}
      {policy ? (
        <div className="grid gap-1">
          <p className="inline-flex items-center gap-1.5 t-ui font-semibold text-ink"><Gift aria-hidden className="h-4 w-4" />{giftExchangeLabel(policy.exchange_days)}</p>
          {policy.note ? <p className="t-ui text-ink">{policy.note}</p> : null}
          <p className="t-meta">{GIFT_EXCHANGE_DISCLAIMER} <Link href={GIFTS_PATH} className="link">Ideas para regalar</Link></p>
        </div>
      ) : null}
    </section>
  );
}
