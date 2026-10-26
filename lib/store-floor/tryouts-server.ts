import type { SupabaseClient } from "@supabase/supabase-js";
import { whenLabel } from "@/lib/store-floor/dates";
import { DEFAULT_TRYOUT_SETTINGS, type Tryout, type TryoutSettings } from "@/lib/store-floor/tryouts";

// Server reads for buy-07. Row-level security decides what each side sees: the buyer their own try-outs, the store
// owner its store's.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

const COLUMNS = "id,store_id,listing_id,listing_title,buyer_user_id,buyer_name,buyer_phone,buyer_note,starts_at,ends_at,status,cancelled_by,store_reason,created_at";
const STORE_COLUMNS = "id,name,slug,whatsapp_phone,public_address,district,city";

type Row = Omit<Tryout, "when_label" | "listing_slug" | "store">;
type StoreRow = { id: string } & NonNullable<Tryout["store"]>;

async function complete(db: SupabaseClient, rows: Row[]): Promise<Tryout[]> {
  const listingIds = [...new Set(rows.map((row) => row.listing_id).filter((id): id is string => Boolean(id)))];
  const storeIds = [...new Set(rows.map((row) => row.store_id))];
  const [{ data: listings }, { data: stores }] = await Promise.all([
    listingIds.length ? db.from("listings").select("id,slug").in("id", listingIds) : Promise.resolve({ data: [] }),
    storeIds.length ? db.from("stores").select(STORE_COLUMNS).in("id", storeIds) : Promise.resolve({ data: [] }),
  ]);
  const slugs = new Map(((listings ?? []) as { id: string; slug: string }[]).map((listing) => [listing.id, listing.slug]));
  const storeById = new Map(((stores ?? []) as StoreRow[]).map((store) => [store.id, store]));
  return rows.map((row) => {
    const store = storeById.get(row.store_id);
    return {
      ...row,
      when_label: whenLabel(row.starts_at),
      listing_slug: row.listing_id ? slugs.get(row.listing_id) ?? null : null,
      store: store ? { name: store.name, slug: store.slug, whatsapp_phone: store.whatsapp_phone, public_address: store.public_address, district: store.district, city: store.city } : null,
    };
  });
}

// The store's agenda: requests to answer, confirmed try-outs ahead, and the last 30 days.
export async function loadStoreTryouts(supabase: AnyClient, storeId: string, now = Date.now()) {
  const db = supabase as unknown as SupabaseClient;
  const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db.from("store_tryouts").select(COLUMNS).eq("store_id", storeId).gte("starts_at", since).order("starts_at", { ascending: true }).limit(400);
  const all = await complete(db, (data ?? []) as Row[]);
  const future = (tryout: Tryout) => Date.parse(tryout.ends_at) > now;
  return {
    requested: all.filter((tryout) => tryout.status === "requested" && future(tryout)),
    upcoming: all.filter((tryout) => tryout.status === "confirmed" && future(tryout)),
    past: all.filter((tryout) => !(["requested", "confirmed"].includes(tryout.status) && future(tryout))).reverse().slice(0, 30),
  };
}

// Today's try-outs for the Mi tienda card (and the count of requests to answer).
export async function loadStoreTryoutsToday(supabase: AnyClient, storeId: string, now = Date.now()) {
  const db = supabase as unknown as SupabaseClient;
  const startOfDay = new Date(Math.floor((now - 5 * 3600000) / 86400000) * 86400000 + 5 * 3600000);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const [{ data: today }, { count: pending }] = await Promise.all([
    db.from("store_tryouts").select("id,listing_title,buyer_name,starts_at,status").eq("store_id", storeId).eq("status", "confirmed")
      .gte("starts_at", startOfDay.toISOString()).lt("starts_at", endOfDay.toISOString()).order("starts_at", { ascending: true }).limit(20),
    db.from("store_tryouts").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "requested").gt("starts_at", new Date(now).toISOString()),
  ]);
  return {
    today: (today ?? []) as { id: string; listing_title: string; buyer_name: string; starts_at: string }[],
    pending: pending ?? 0,
  };
}

export async function loadBuyerTryouts(supabase: AnyClient, userId: string, now = Date.now()) {
  const db = supabase as unknown as SupabaseClient;
  const { data } = await db.from("store_tryouts").select(COLUMNS).eq("buyer_user_id", userId).order("starts_at", { ascending: false }).limit(100);
  const all = await complete(db, (data ?? []) as Row[]);
  const open = (tryout: Tryout) => ["requested", "confirmed"].includes(tryout.status) && Date.parse(tryout.ends_at) > now;
  return { upcoming: all.filter(open).reverse(), past: all.filter((tryout) => !open(tryout)) };
}

export async function loadTryoutSettings(supabase: AnyClient, storeId: string): Promise<TryoutSettings> {
  const { data } = await (supabase as unknown as SupabaseClient).from("store_tryout_settings")
    .select("enabled,weekly_hours,slot_minutes,capacity,min_notice_hours,max_days_ahead,note").eq("store_id", storeId).maybeSingle();
  return data ? { ...DEFAULT_TRYOUT_SETTINGS, ...(data as Partial<TryoutSettings>) } : DEFAULT_TRYOUT_SETTINGS;
}
