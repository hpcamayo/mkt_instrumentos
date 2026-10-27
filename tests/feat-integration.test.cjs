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
  const mains = ["listings", "listing_photos", "listing_sound_clips", "stores", "profiles", "transaction_reviews",
    "store_payment_methods", "store_inventory_items"];
  const read = [
    "app/instrumentos/[slug]/page.tsx", "components/store-floor/tryout-entry.tsx", "components/selling/listing-sound-clip.tsx",
  ].flatMap((file) => [...source(file).matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]));
  read.push(source("lib/discovery/data.ts").match(/getCurrentCollections[\s\S]*?\.from\("([a-z_]+)"\)/)[1]);
  for (const table of read) assert.ok(mains.includes(table) || triggered.includes(table), `${table} records its changes`);

  // disc-03's dates come with time alone, like a pause that ends.
  assert.match(migration, /select laria_private\.patch_function_text\(\n  'public\.claim_public_page_changes\(text\)'::regprocedure,/);
});
