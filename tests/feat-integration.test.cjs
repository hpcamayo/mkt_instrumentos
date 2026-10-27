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
