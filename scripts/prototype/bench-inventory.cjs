#!/usr/bin/env node
// Indicative Store Operations benchmarks (design §14.5) on synthetic data, LOCAL databases only.
// Not the STORE-4 production-tier runs: a laptop or container Postgres says nothing firm about Supabase compute.
//
//   node scripts/prototype/bench-inventory.cjs [postgres-url]          # default postgresql://postgres@127.0.0.1:54322/postgres
//   BENCH_ITEMS=5000 BENCH_MOVES=20000 BENCH_RUNS=40 node scripts/prototype/bench-inventory.cjs
//   BENCH_REST=http://127.0.0.1:54321 also times the public catalog query through PostgREST.
//
// It creates its own store, owner and listings (ids starting bbbb…) and leaves them in place: run it on a database
// you will reset afterwards. Output is a Markdown table on stdout.
const { Client } = require("pg");

const url = process.argv[2] || process.env.LARIA_TEST_DATABASE_URL || "postgresql://postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) throw new Error(`Refusing non-local database ${url}`);
const ITEMS = Number(process.env.BENCH_ITEMS || 5000);
const MOVES = Number(process.env.BENCH_MOVES || 20000);
const RUNS = Number(process.env.BENCH_RUNS || 40);
const OWNER = "bbbb0000-0000-4000-8000-000000000001";
const STORE = "bbbb1000-0000-4000-8000-000000000001";
const ADMIN = "bbbb0000-0000-4000-8000-000000000099";

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const ms = (t) => Number(process.hrtime.bigint() - t) / 1e6;

async function asUser(db, sub, admin = false) {
  await db.query("select set_config('request.jwt.claims', $1, false)",
    [JSON.stringify({ sub, role: "authenticated", ...(admin ? { app_metadata: { role: "admin" } } : {}) })]);
  await db.query("set role authenticated");
}

(async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  const out = [];
  const exists = (await db.query("select 1 from public.stores where id = $1", [STORE])).rowCount > 0;
  if (!exists) {
    await db.query(`insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
      ($1,'authenticated','authenticated','bench-owner@laria.test',now(),'{}','{"account_type":"store_owner","full_name":"Bench Owner","phone":"51999000901","city":"Lima","region":"Lima"}'),
      ($2,'authenticated','authenticated','bench-admin@laria.test',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Bench Admin"}')`, [OWNER, ADMIN]);
    await db.query(`insert into public.stores (id,slug,name,whatsapp_phone,city,region,owner_user_id,status,listing_plan,is_verified)
      values ($1,'bench-store','Bench Store','51999000901','Lima','Lima',$2,'active','growth_50',true)`, [STORE, OWNER]);
    await asUser(db, ADMIN, true);
    await db.query("select public.admin_set_store_inventory_enabled($1, true, 'benchmark')", [STORE]);
    await db.query("reset role");

    // Some items get a published listing so the publication filters have rows.
    const linked = Math.min(45, ITEMS); // V1 cap of 50 concurrent listings until STORE-3b
    await db.query(`insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition,
        price_pen, city, region, contact_name, whatsapp_phone, description, owner_user_id, store_id, created_by_source, marketplace_rules_accepted_at)
      select ('bbbb2000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'bench-l-' || n, 'Producto bench ' || n, 'store', 'approved',
        (array['guitars','pedals','amplifiers','microphones','audio'])[1 + n % 5], 'pedals', 'Bench', 'M' || n, 'Nuevo',
        100 + n, 'Lima', 'Lima', 'Bench', '51999000901', 'Descripción de inventario válida con más de cuarenta caracteres.', $1, $2, 'self_service', now()
      from generate_series(1, $3) n`, [OWNER, STORE, linked]);

    await asUser(db, OWNER);
    let t = process.hrtime.bigint();
    for (let n = 1; n <= ITEMS; n++) {
      await db.query("select public.create_inventory_item($1, $2, $3)", [
        { merchant_sku: `BEN-${String(n).padStart(5, "0")}`, product_name: `Producto bench ${n} ${["Boss", "Fender", "Yamaha", "Shure", "Ibanez"][n % 5]}`,
          unit_price_pen: 100 + n, low_stock_threshold: 3 }, 20 + (n % 30), `bench-create-${n}`]);
    }
    const createMs = ms(t);
    out.push(["create_inventory_item (opening balance)", ITEMS, (createMs / ITEMS).toFixed(2), "", ""]);

    const ids = (await db.query("select id, version from public.store_inventory_items where store_id = $1 order by merchant_sku", [STORE])).rows;
    t = process.hrtime.bigint();
    for (let n = 0; n < linked; n++) {
      await db.query("select public.link_inventory_listing($1, $2, $3, $4)", [ids[n].id, `bbbb2000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, ids[n].version, 101 + n]);
    }
    out.push(["link_inventory_listing", linked, (ms(t) / linked).toFixed(2), "", ""]);

    const times = [];
    const types = [["sale", "tienda_fisica"], ["restock", null], ["sale", "whatsapp_laria"], ["damage_or_loss", null], ["return", "tienda_fisica"]];
    for (let n = 0; n < MOVES - ITEMS; n++) {
      const [type, channel] = types[n % types.length];
      const s = process.hrtime.bigint();
      await db.query("select public.record_stock_movement($1, $2, 1, $3, null, 'bench', null, $4)", [ids[n % ITEMS].id, type, channel, `bench-move-${n}`]);
      times.push(ms(s));
    }
    out.push(["record_stock_movement (opening balances count toward the 20,000)", times.length, pct(times, 50).toFixed(2), pct(times, 95).toFixed(2), pct(times, 99).toFixed(2)]);
    await db.query("reset role");
    await db.query("analyze public.store_inventory_items; analyze public.store_stock_movements; analyze public.listings");
  }

  await asUser(db, OWNER);
  const counts = (await db.query("select (select count(*) from public.store_inventory_items where store_id=$1) items, (select count(*) from public.store_stock_movements where store_id=$1) moves", [STORE])).rows[0];
  const cases = [
    ["page: updated (default)", { sort: "updated" }], ["page: name", { sort: "name" }],
    ["page: available asc", { sort: "available_asc" }], ["page: available desc", { sort: "available_desc" }],
    ["page: price asc", { sort: "price_asc" }], ["page: price desc", { sort: "price_desc" }],
    ["page: stock low", { stock: "low" }], ["page: stock out", { stock: "out" }], ["page: archived", { stock: "archived" }],
    ["page: published", { publication: "published" }], ["page: no listing", { publication: "none" }],
    ["page: category pedals", { category: "pedals" }], ["page: unmatched catalog", { catalog: "unmatched" }],
    ["page: search 'fender'", { q: "fender" }], ["page: search SKU 'BEN-0421'", { q: "BEN-0421" }],
  ];
  for (const [label, filters] of cases) {
    const xs = [];
    for (let r = 0; r < RUNS; r++) { const s = process.hrtime.bigint(); await db.query("select public.get_inventory_page($1, null, 50)", [filters]); xs.push(ms(s)); }
    out.push([label, RUNS, pct(xs, 50).toFixed(2), pct(xs, 95).toFixed(2), pct(xs, 99).toFixed(2)]);
  }
  {
    const first = (await db.query("select public.get_inventory_page('{\"sort\":\"name\"}', null, 50) p")).rows[0].p;
    let cursor = first.next_cursor; for (let k = 0; k < 40 && cursor; k++) cursor = (await db.query("select public.get_inventory_page('{\"sort\":\"name\"}', $1, 50) p", [cursor])).rows[0].p.next_cursor;
    const xs = [];
    for (let r = 0; r < RUNS; r++) { const s = process.hrtime.bigint(); await db.query("select public.get_inventory_page('{\"sort\":\"name\"}', $1, 50)", [cursor]); xs.push(ms(s)); }
    out.push(["page: name, page 42 by cursor", RUNS, pct(xs, 50).toFixed(2), pct(xs, 95).toFixed(2), pct(xs, 99).toFixed(2)]);
  }
  {
    const xs = [];
    for (let r = 0; r < RUNS; r++) { const s = process.hrtime.bigint(); await db.query("select public.get_inventory_summary()"); xs.push(ms(s)); }
    out.push(["get_inventory_summary", RUNS, pct(xs, 50).toFixed(2), pct(xs, 95).toFixed(2), pct(xs, 99).toFixed(2)]);
  }
  await db.query("reset role");
  if (process.env.BENCH_REST) {
    const anon = process.env.BENCH_ANON_KEY || "anon";
    const q = `${process.env.BENCH_REST}/rest/v1/listings?select=id,slug,title,price_pen,stock_state&status=eq.approved&or=(stock_state.is.null,stock_state.eq.in_stock)&order=created_at.desc&limit=24`;
    const xs = [];
    for (let r = 0; r < RUNS; r++) { const s = process.hrtime.bigint(); const res = await fetch(q, { headers: { apikey: anon } }); await res.text(); xs.push(ms(s)); }
    out.push(["catalog query with stock predicate (PostgREST, 24 cards)", RUNS, pct(xs, 50).toFixed(2), pct(xs, 95).toFixed(2), pct(xs, 99).toFixed(2)]);
  }
  await db.end();

  console.log(`Synthetic store: ${counts.items} items, ${counts.moves} movements. Times in ms, single client, warm cache.\n`);
  console.log("| Operation | Runs | p50 | p95 | p99 |\n| --- | ---: | ---: | ---: | ---: |");
  for (const row of out) console.log(`| ${row.join(" | ")} |`);
})().catch((e) => { console.error(e); process.exit(1); });
