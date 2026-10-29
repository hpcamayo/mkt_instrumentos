// The live mode's own check before a run (not acceptance cases): a test listing with uploaded photos, sign-in and a
// saved session, a write about someone else's listing refused before it leaves the browser, a store switched to
// Inventario with Admin SQL, and the three ways a case stops as local only. Locally:
//   LIVE=1 LIVE_ACCOUNTS=1 LIVE_DB=scripts/acceptance/ease/live-db-local.sh node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/live-smoke.cjs
const favorite = (page, id) => page.evaluate((listingId) => fetch("/api/favorites", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set", id: listingId, saved: true }) })
  .then((r) => r.status).catch(() => "blocked"), id);
module.exports = [
  {
    id: "LIVE-SMOKE-1",
    run: async (t) => {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller, { title: "Prueba EASE Zzprueba Humo", brand: "Zzprueba", model: "Humo", price: 1777, photos: 2 });
      const page = await t.page({ phone: true });
      const response = await t.goto(page, item.path);
      t.check(response.status() === 200, `listing page answers 200 (${response.status()})`);
      const photos = await page.locator("img[src*='listing-photos'], img[srcset*='listing-photos']").count();
      t.check(photos > 0, `uploaded photos show (${photos})`);
      await t.shot(page, "listing");
      const own = await t.page({ as: seller.email });
      t.check(own.url().includes("/mi-cuenta"), `seller signed in (${own.url()})`);
      const again = await t.page({ as: seller.email });
      t.check(again.url().includes("/mi-cuenta"), `saved session reused (${again.url()})`);
      const buyer = t.account({ kind: "buyer" });
      const buying = await t.page({ as: buyer.email });
      const ours = await favorite(buying, item.id);
      t.check(ours === 200, `a buyer can save the run's test listing (${ours})`);
    },
  },
  {
    id: "LIVE-SMOKE-2",
    run: async (t) => {
      const [theirs] = t.sql(`select id from public.listings where status = 'approved'
        and owner_user_id not in (select id from auth.users where email like 'delivered+ease-%') limit 1`);
      const buyer = t.account({ kind: "buyer" });
      const page = await t.page({ as: buyer.email });
      const status = await favorite(page, theirs.id);
      t.check(status === "blocked", `a write about someone else's listing is refused (${status})`);
      // This refusal is the expected assertion in the safety rehearsal.
      if (status === "blocked") delete t.record.liveUnsafe;
    },
  },
  {
    id: "LIVE-SMOKE-3",
    run: async (t) => {
      const owner = t.account({ kind: "store_owner" });
      const shop = t.store(owner, { inventory: true });
      const [item] = t.sqlAs(owner.id, `select public.create_inventory_item('{"merchant_sku":"EASE-SMOKE","product_name":"Prueba inventario","unit_price_pen":10}'::jsonb, 2, 'ease-smoke-stock') as r`);
      t.check(Boolean(item.r.item.id), "inventory ledger fixture created for teardown");
      const page = await t.page();
      const response = await t.goto(page, `/tiendas/${shop.slug}`);
      t.check(response.status() === 200, `store page answers 200 (${response.status()})`);
    },
  },
  { id: "LIVE-SMOKE-4", run: async (t) => { await t.page({ as: t.demo.store }); t.check(true, "unreachable"); } },
  { id: "LIVE-SMOKE-5", run: async (t) => { await t.cron("/api/internal/email/process"); t.check(true, "unreachable"); } },
  { id: "LIVE-SMOKE-6", run: async (t) => { const page = await t.page({ as: t.demo.admin }); t.check(Boolean(page), "unreachable"); } },
];
