// Feature ideas, integration (docs/feature-ideas/build-plan.md): where the batches meet main's launch-audit fixes. The
// database side is tests/feat-integration.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = (file) => fs.readFileSync(file, "utf8");

test("safe-08 with A16: the browser sign-in keeps «Mantener sesión iniciada» and the new-device e-mail", () => {
  const form = source("components/login-form.tsx");
  // The marker is written before signing in, because the browser client reads it when it writes the session cookies.
  const marker = form.indexOf("document.cookie = serializeCookie(marker.name, marker.value, marker.options);");
  const signIn = form.indexOf("await supabase.auth.signInWithPassword({ email, password });");
  assert.ok(marker > 0 && signIn > marker, "the marker comes before the sign-in");
  assert.match(form, /const marker = rememberMarker\(remember, window\.location\.protocol === "https:"\);/);
  // Then the server records the browser (its identifier cookie is httpOnly), without holding up the sign-in.
  const device = form.indexOf('await fetch("/api/account/sessions/device", { method: "POST", credentials: "include" }).catch(() => null);');
  assert.ok(device > signIn, "the browser is recorded after the sign-in");
  assert.doesNotMatch(form, /fetch\("\/api\/auth\/login"/);

  const route = source("app/api/account/sessions/device/route.ts");
  assert.match(route, /const client = await accountClient\(request\);/);
  assert.match(route, /await recordSignInDevice\(client\.supabase, request, response\);/);

  // The server sign-ins keep the choice, the device and the code step, with main's limits and forwarded address.
  const login = source("app/api/auth/login/route.ts");
  assert.match(login, /if \(!\(await allowRequest\(RATE_LIMITS\.login, request\)\)\) return failure\(TOO_MANY_ATTEMPTS, 429\);/);
  assert.match(login, /createServerClient<Database>\(supabaseUrl, forwarded\?\.key \?\? supabaseAnonKey,/);
  assert.match(login, /response\.cookies\.set\(name, value, withRememberChoice\(options, remember\)\);/);
  assert.match(login, /await recordSignInDevice\(supabase, request, response\);/);
  const callback = source("app/auth/callback/route.ts");
  assert.match(callback, /response\.cookies\.set\(name, value, withRememberChoice\(options, remember\)\),/);
  assert.match(callback, /await recordSignInDevice\(supabase, request, response\);/);
});

test("safe-08 with A15: one two-step component serves the security page and the password forms", () => {
  assert.equal(fs.existsSync("components/auth/two-step-verification.tsx"), false);
  assert.match(source("components/password-form.tsx"), /import \{ TwoStepCode \} from "@\/components\/auth\/two-step-setup";/);
  assert.match(source("app/mi-cuenta/seguridad/page.tsx"), /import \{ TwoStepCode, TwoStepSetup, type TwoStepState \} from "@\/components\/auth\/two-step-setup";/);
  assert.match(source("components/auth/two-step-setup.tsx"), /import \{ readTwoStepCode, twoStepErrorMessage \} from "@\/lib\/auth\/two-step-input";/);
});

test("A19 for the branch: every new table the cached pages read records its changes, locked all at once", () => {
  const migration = source("supabase/migrations/20261210120300_feat_page_refresh.sql");
  const locked = migration.match(/lock table ([\s\S]*?)\n      in share row exclusive mode nowait;/)[1]
    .split(",").map((name) => name.trim().replace(/^public\./, "")).sort();
  const triggered = migration.match(/foreach t in array array\[([\s\S]*?)\]\n  loop/)[1]
    .split(",").map((name) => name.trim().replace(/'/g, "")).sort();
  const parts = [...migration.matchAll(/^    when '([a-z_]+)' then/gm)].map((match) => match[1]).sort();
  assert.equal(triggered.length, 15);
  // A seller page is made with its owner's first approved listing, which records itself.
  assert.match(migration, /if t <> 'seller_pages' then\n      execute format\('create or replace trigger %I after insert on/);
  assert.deepEqual(locked, triggered, "the first statement locks every table that gets a trigger");
  assert.deepEqual(parts, triggered, "laria_private.feature_page_part says what the pages show of each");
  // Main's pattern: the locks come first, without waiting, retried, with the error main's migration raises.
  assert.ok(migration.indexOf("in share row exclusive mode nowait;") < migration.indexOf("create or replace function"));
  assert.match(migration, /exception when lock_not_available then\n      if clock_timestamp\(\) > give_up then\n        raise exception using errcode = 'lock_not_available',\n          message = 'PAGE_REFRESH_TABLES_BUSY: [^']+';/);
  assert.match(migration, /^set lock_timeout = '10s';$/m);

  // The tables the listing page and the home read directly are main's or the migration's.
  const mains = ["listings", "public_listings", "listing_photos", "listing_sound_clips", "stores", "profiles", "transaction_reviews",
    "store_payment_methods", "store_inventory_items"];
  const read = [
    "app/instrumentos/[slug]/page.tsx", "components/store-floor/tryout-entry.tsx", "components/selling/listing-sound-clip.tsx",
  ].flatMap((file) => [...source(file).matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]));
  read.push(source("lib/discovery/data.ts").match(/getCurrentCollections[\s\S]*?\.from\("([a-z_]+)"\)/)[1]);
  for (const table of read) assert.ok(mains.includes(table) || triggered.includes(table), `${table} records its changes`);

  // disc-03's dates come with time alone, like a pause that ends.
  assert.match(migration, /select laria_private\.patch_function_text\(\n  'public\.claim_public_page_changes\(text\)'::regprocedure,/);
});

// The columns of a view or grant list: "l.id,\n  l.title" → ["id", "title"].
const columnList = (list) => list.split(",").map((column) => column.trim().replace(/^l\./, ""));
const withoutComments = (sql) => sql.replace(/--[^\n]*/g, "");

test("A27 for the branch: its listing columns are public, at the end of public_listings, and the cards ask for no other", () => {
  const branchColumns = fs.readdirSync("supabase/migrations").filter((file) => /^2026(?:120|121)\d{7}_feat_/.test(file))
    .flatMap((file) => [...withoutComments(source(`supabase/migrations/${file}`)).matchAll(/alter table (?:only )?public\.listings\b([^;]*);/gi)])
    .flatMap((statement) => [...statement[1].matchAll(/add column (?:if not exists )?([a-z_]+)/g)].map((match) => match[1]));
  assert.equal(branchColumns.length, 20, "the branch's listing columns");

  const migration = source("supabase/migrations/20261210120500_feat_public_columns.sql");
  const granted = columnList(migration.match(/grant select \(([^)]*)\) on public\.listings to anon, authenticated;/)[1]);
  assert.deepEqual([...granted].sort(), [...branchColumns].sort(), "every branch column is granted (a private one would be listed here)");
  const view = columnList(migration.match(/create or replace view public\.public_listings\s+with \(security_invoker = true\)\s+as\s+select([\s\S]*?)from public\.listings l;/)[1]);
  const mains = columnList(source("supabase/migrations/20261114130000_launch_audit_contact_reads.sql")
    .match(/create view public\.public_listings\s+with \(security_invoker = true\)\s+as\s+select([\s\S]*?)from public\.listings l;/)[1]);
  assert.deepEqual(view, [...mains, ...granted], "main's columns first, in order, then the granted ones in the grant's order");

  // The card and store-page selects read the view.
  const cards = source("lib/catalog.ts").match(/const CARD_COLUMNS = `([\s\S]*?)`;/)[1];
  const store = source("app/tiendas/[slug]/page.tsx").match(/const STORE_LISTING_SELECT = `([\s\S]*?)`;/)[1];
  for (const select of [cards + ",installments_max", store, source("app/vendedores/[slug]/page.tsx").match(/const LISTING_SELECT = `([\s\S]*?)`;/)[1]]) {
    const top = select.replace(/[\w!:]+\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "").split(",").map((column) => column.trim().split(":").pop().trim()).filter(Boolean);
    const unknown = top.filter((column) => !view.includes(column) && column !== "listing_photo_count");
    assert.deepEqual(unknown, [], "a card column public_listings lacks");
  }
  assert.match(source("app/vendedores/[slug]/page.tsx"), /\.from\("public_listings"\)\s*\.select\(LISTING_SELECT\)/);
  // A select built by catalogCardSelect() asks for photo_count, which main's scan of literal selects can't see.
  const builtOnListings = ["app", "lib", "components"].flatMap(function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(`${dir}/${entry.name}`)
      : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
  }).filter((file) => /\.from\("listings"\)\s*\.select\(catalogCardSelect\(/.test(source(file)));
  assert.deepEqual(builtOnListings, [], "card selects read public_listings");
});

test("A20 for the branch: deleting an account runs the audit's anonymiser, which clears the branch's tables", () => {
  const sql = source("supabase/migrations/20261210120400_feat_account_privacy.sql");
  assert.equal(fs.existsSync("supabase/migrations/20261201120100_feat_anonymize_standin.sql"), false, "the stand-in is gone");
  assert.doesNotMatch(source("supabase/migrations/20261201120500_feat_account_data.sql"), /function (?:laria_private\.anonymize_account_feature_data|public\.service_delete_account)/,
    "one definition of each, in the integration migration");
  // Admin's anonymiser calls the hook too, so it no longer asks for the service role; no API role may call it.
  const hook = sql.match(/create or replace function laria_private\.anonymize_account_feature_data\(p_user_id uuid\)[\s\S]*?\n\$\$;/)[0];
  assert.doesNotMatch(hook, /service_role/);
  assert.match(sql, /revoke all on function laria_private\.anonymize_account_feature_data\(uuid\) from public, anon, authenticated, service_role;/);
  assert.match(sql, /return laria_private\.anonymize_account\(p_user_id, 'self_service'\);/);
  assert.match(hook, /insert into laria_private\.upload_removals \(bucket, path\)\s+select 'stolen-gear-photos', p\.storage_path/);
  // Every branch table that names an account is cleared, closed or deliberately kept.
  const handled = ["account_devices", "account_recovery_codes", "account_recovery_attempts", "help_tickets", "stolen_gear_reports",
    "listing_serials", "listing_photo_fingerprints", "gear_items", "listing_price_steps", "listing_private_offers",
    "listing_private_offer_recipients", "seller_bundle_offers", "trade_requests", "artist_profiles", "seller_pages", "seller_levels",
    "buyer_track_records", "store_tryouts", "services", "service_bookings", "service_events", "store_mercadolibre_connections"];
  for (const table of handled) assert.match(hook, new RegExp(`(?:from|update) (?:public|laria_private)\\.${table}\\b`), table);
  // The route leaves the files to the uploads sweep.
  const route = source("app/api/account/delete/route.ts");
  assert.doesNotMatch(route, /stolen-gear-photos|stolen_photo_paths/);
  assert.match(route, /const \{ error \} = await admin\.rpc\("service_delete_account", \{ p_user_id: user\.id \}\);/);
});
